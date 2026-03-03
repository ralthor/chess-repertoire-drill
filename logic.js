const DEFAULT_STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const VENDOR_TAG_COLORS = new Set(['G', 'R', 'Y', 'B']);

function resolveChessCtor() {
    if (typeof Chess !== 'undefined') {
        return Chess;
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.Chess !== 'undefined') {
        return globalThis.Chess;
    }
    if (typeof require === 'function') {
        try {
            const chessModule = require('chess.js');
            if (chessModule && typeof chessModule.Chess === 'function') {
                return chessModule.Chess;
            }
            if (typeof chessModule === 'function') {
                return chessModule;
            }
        } catch (err) {
            // Ignore; caller will get a clear error below.
        }
    }
    throw new Error('Chess constructor is unavailable.');
}

function isResultToken(text) {
    return text === '1-0' || text === '0-1' || text === '1/2-1/2' || text === '*';
}

function normalizeCommentText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

function parseHeaderToken(raw) {
    const headerMatch = raw.match(/^\[\s*([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\s*\]$/);
    if (!headerMatch) {
        return null;
    }

    const key = headerMatch[1];
    const value = headerMatch[2]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

    return { key, value };
}

function escapeHeaderValue(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
}

function parseVendorTagsFromComment(rawText) {
    const tags = {
        cal: [],
        csl: []
    };

    const strippedText = (rawText || '').replace(/\[%\s*(cal|csl)\s+([^\]]*)\]/gi, function(match, tagName, payload) {
        const kind = tagName.toLowerCase();
        const items = String(payload || '').split(',').map(item => item.trim()).filter(Boolean);

        items.forEach(item => {
            if (kind === 'cal') {
                const arrowMatch = item.match(/^([GRYB])([a-h][1-8])([a-h][1-8])$/i);
                if (!arrowMatch) {
                    return;
                }
                const color = arrowMatch[1].toUpperCase();
                if (!VENDOR_TAG_COLORS.has(color)) {
                    return;
                }
                tags.cal.push({
                    color,
                    from: arrowMatch[2].toLowerCase(),
                    to: arrowMatch[3].toLowerCase()
                });
                return;
            }

            const squareMatch = item.match(/^([GRYB])([a-h][1-8])$/i);
            if (!squareMatch) {
                return;
            }
            const color = squareMatch[1].toUpperCase();
            if (!VENDOR_TAG_COLORS.has(color)) {
                return;
            }
            tags.csl.push({
                color,
                square: squareMatch[2].toLowerCase()
            });
        });

        return ' ';
    });

    return {
        text: normalizeCommentText(strippedText),
        tags
    };
}

// Move tree node - represents a position and how we got there
class MoveNode {
    constructor(move, fen, parent = null) {
        this.move = move;      // SAN notation (e.g., "Nf3"), null for root
        this.fen = fen;        // Board state after this move
        this.children = [];    // Next moves (main line first, then variations)
        this.parent = parent;  // To navigate back

        this.commentsBefore = [];
        this.commentsAfter = [];
        this.nags = [];
        this.suffixOrder = [];
    }

    addChild(node) {
        node.parent = this;
        this.children.push(node);
        return node;
    }

    // Check if this node has variations (more than one child)
    hasVariations() {
        return this.children.length > 1;
    }

    // Get the main line continuation
    getMainLine() {
        return this.children[0] || null;
    }

    // Get all variations (excluding main line)
    getVariations() {
        return this.children.slice(1);
    }
}

// PGN Parser + serializer supporting comments, NAGs, and variations
class PgnParser {
    constructor(chessCtor = null) {
        this.ChessCtor = chessCtor || resolveChessCtor();
        this.game = new this.ChessCtor();
    }

    tokenizeText(raw) {
        if (!raw) {
            return [];
        }

        if (raw === '...') {
            return [{ type: 'move_number', raw }];
        }

        if (isResultToken(raw)) {
            return [{ type: 'result', raw, value: raw }];
        }

        if (/^\d+\.(?:\.\.)?$/.test(raw)) {
            return [{ type: 'move_number', raw }];
        }

        const compactMoveMatch = raw.match(/^(\d+\.(?:\.\.)?)(.+)$/);
        if (compactMoveMatch) {
            return [
                { type: 'move_number', raw: compactMoveMatch[1] },
                ...this.tokenizeText(compactMoveMatch[2])
            ];
        }

        const resultSuffixMatch = raw.match(/^(.*?)(1-0|0-1|1\/2-1\/2|\*)$/);
        if (resultSuffixMatch && resultSuffixMatch[1]) {
            return [
                ...this.tokenizeText(resultSuffixMatch[1]),
                { type: 'result', raw: resultSuffixMatch[2], value: resultSuffixMatch[2] }
            ];
        }

        return [{ type: 'san', raw, value: raw }];
    }

    tokenize(pgn) {
        const tokens = [];
        const source = String(pgn || '');
        const specialChars = new Set(['{', '}', '(', ')', ';', '$', '[', ']']);

        let index = 0;
        while (index < source.length) {
            const char = source[index];

            if (/\s/.test(char)) {
                index++;
                continue;
            }

            if (char === '{') {
                const start = index;
                index++;
                while (index < source.length && source[index] !== '}') {
                    index++;
                }
                if (index < source.length && source[index] === '}') {
                    index++;
                }
                const raw = source.slice(start, index);
                tokens.push({
                    type: 'comment',
                    kind: 'brace',
                    raw,
                    content: raw.length >= 2 ? raw.slice(1, -1) : ''
                });
                continue;
            }

            if (char === ';') {
                const start = index;
                index++;
                while (index < source.length && source[index] !== '\n' && source[index] !== '\r') {
                    index++;
                }
                const raw = source.slice(start, index);
                tokens.push({
                    type: 'comment',
                    kind: 'line',
                    raw,
                    content: raw.slice(1)
                });
                continue;
            }

            if (char === '(') {
                tokens.push({ type: 'lparen', raw: '(' });
                index++;
                continue;
            }

            if (char === ')') {
                tokens.push({ type: 'rparen', raw: ')' });
                index++;
                continue;
            }

            if (char === '$') {
                const start = index;
                index++;
                while (index < source.length && /\d/.test(source[index])) {
                    index++;
                }
                const raw = source.slice(start, index);
                if (/^\$\d+$/.test(raw)) {
                    tokens.push({
                        type: 'nag',
                        raw,
                        value: parseInt(raw.slice(1), 10)
                    });
                } else {
                    tokens.push({ type: 'san', raw, value: raw });
                }
                continue;
            }

            if (char === '[') {
                const start = index;
                index++;
                let inQuotes = false;
                while (index < source.length) {
                    const current = source[index];
                    const prev = index > 0 ? source[index - 1] : '';
                    if (current === '"' && prev !== '\\') {
                        inQuotes = !inQuotes;
                    } else if (current === ']' && !inQuotes) {
                        index++;
                        break;
                    }
                    index++;
                }
                const raw = source.slice(start, index);
                const parsedHeader = parseHeaderToken(raw);
                if (parsedHeader) {
                    tokens.push({ type: 'header', raw, header: parsedHeader });
                } else {
                    tokens.push({ type: 'san', raw, value: raw });
                }
                continue;
            }

            const start = index;
            while (
                index < source.length
                && !/\s/.test(source[index])
                && !specialChars.has(source[index])
            ) {
                index++;
            }
            const raw = source.slice(start, index);
            tokens.push(...this.tokenizeText(raw));
        }

        return tokens;
    }

    parseCommentToken(token) {
        const rawText = String(token.content || '');
        const parsed = parseVendorTagsFromComment(rawText);
        return {
            text: parsed.text,
            tags: parsed.tags,
            rawText,
            kind: token.kind
        };
    }

    appendCommentAfter(node, comment) {
        if (!node || !comment) {
            return;
        }
        node.commentsAfter.push(comment);
        node.suffixOrder.push({ type: 'comment', index: node.commentsAfter.length - 1 });
    }

    appendNag(node, nagValue) {
        if (!node || !Number.isInteger(nagValue)) {
            return;
        }
        node.nags.push(nagValue);
        node.suffixOrder.push({ type: 'nag', index: node.nags.length - 1 });
    }

    tryParseMove(parentNode, tokenValue) {
        if (!parentNode || !tokenValue) {
            return null;
        }

        this.game.load(parentNode.fen);
        let moveResult = this.game.move(tokenValue, { sloppy: true });

        if (!moveResult) {
            const strippedToken = tokenValue.replace(/[!?]+$/g, '');
            if (strippedToken && strippedToken !== tokenValue) {
                this.game.load(parentNode.fen);
                moveResult = this.game.move(strippedToken, { sloppy: true });
            }
        }

        if (!moveResult) {
            return null;
        }

        return new MoveNode(tokenValue, this.game.fen());
    }

    parseTokens(tokens, index, currentNode, document, stopOnRParen = false) {
        let node = currentNode;
        let hasMoveInLine = false;
        let pendingBeforeComments = [];

        while (index < tokens.length) {
            const token = tokens[index];

            if (token.type === 'header') {
                document.headers.push(token.header);
                index++;
                continue;
            }

            if (token.type === 'result') {
                if (!document.result) {
                    document.result = token.value;
                }
                index++;
                continue;
            }

            if (token.type === 'rparen') {
                if (stopOnRParen) {
                    if (pendingBeforeComments.length > 0) {
                        if (hasMoveInLine) {
                            pendingBeforeComments.forEach(comment => this.appendCommentAfter(node, comment));
                        } else {
                            currentNode.commentsAfter.push(...pendingBeforeComments);
                        }
                        pendingBeforeComments = [];
                    }
                    return index + 1;
                }
                index++;
                continue;
            }

            if (token.type === 'lparen') {
                const branchPoint = node.parent || currentNode;
                index = this.parseTokens(tokens, index + 1, branchPoint, document, true);
                continue;
            }

            if (token.type === 'comment') {
                const comment = this.parseCommentToken(token);
                if (hasMoveInLine) {
                    this.appendCommentAfter(node, comment);
                } else {
                    pendingBeforeComments.push(comment);
                }
                index++;
                continue;
            }

            if (token.type === 'nag') {
                if (hasMoveInLine) {
                    this.appendNag(node, token.value);
                }
                index++;
                continue;
            }

            if (token.type === 'move_number') {
                index++;
                continue;
            }

            if (token.type === 'san') {
                const newNode = this.tryParseMove(node, token.value);
                if (newNode) {
                    if (pendingBeforeComments.length > 0) {
                        newNode.commentsBefore.push(...pendingBeforeComments);
                        pendingBeforeComments = [];
                    }
                    node.addChild(newNode);
                    node = newNode;
                    hasMoveInLine = true;
                }
                index++;
                continue;
            }

            index++;
        }

        if (pendingBeforeComments.length > 0) {
            if (hasMoveInLine) {
                pendingBeforeComments.forEach(comment => this.appendCommentAfter(node, comment));
            } else {
                currentNode.commentsAfter.push(...pendingBeforeComments);
            }
        }

        return index;
    }

    // Backward-compatible API
    parse(pgn, startingFen = DEFAULT_STARTING_FEN) {
        return this.parseDocument(pgn, startingFen).root;
    }

    parseDocument(pgn, startingFen = DEFAULT_STARTING_FEN) {
        const source = String(pgn || '').trim();
        const root = new MoveNode(null, startingFen, null);
        const tokens = this.tokenize(source);

        this.game.load(startingFen);

        const document = {
            headers: [],
            result: null,
            root,
            originalTokens: tokens,
            originalText: source,
            isDirty: false
        };

        this.parseTokens(tokens, 0, root, document, false);

        return document;
    }

    formatMoveWithNumber(parentFen, sanMove) {
        const game = new this.ChessCtor();
        game.load(parentFen);
        const moveNumber = parseInt(parentFen.split(' ')[5], 10);
        const prefix = game.turn() === 'w' ? `${moveNumber}. ` : `${moveNumber}... `;
        return `${prefix}${sanMove}`;
    }

    serializeComment(comment) {
        if (!comment) {
            return '';
        }
        if (typeof comment.rawText === 'string') {
            return `{${comment.rawText}}`;
        }
        if (typeof comment.text === 'string' && comment.text.length > 0) {
            return `{${comment.text}}`;
        }
        return '{}';
    }

    serializeSuffix(node) {
        if (!node) {
            return '';
        }

        const parts = [];
        const usedCommentIndexes = new Set();
        const usedNagIndexes = new Set();

        node.suffixOrder.forEach(entry => {
            if (!entry || typeof entry !== 'object') {
                return;
            }

            if (entry.type === 'comment') {
                const comment = node.commentsAfter[entry.index];
                if (comment) {
                    parts.push(this.serializeComment(comment));
                    usedCommentIndexes.add(entry.index);
                }
                return;
            }

            if (entry.type === 'nag') {
                const nagValue = node.nags[entry.index];
                if (Number.isInteger(nagValue)) {
                    parts.push(`$${nagValue}`);
                    usedNagIndexes.add(entry.index);
                }
            }
        });

        node.commentsAfter.forEach((comment, index) => {
            if (!usedCommentIndexes.has(index)) {
                parts.push(this.serializeComment(comment));
            }
        });

        node.nags.forEach((nagValue, index) => {
            if (!usedNagIndexes.has(index) && Number.isInteger(nagValue)) {
                parts.push(`$${nagValue}`);
            }
        });

        return parts.join(' ').trim();
    }

    serializeMove(parentNode, childNode) {
        if (!parentNode || !childNode || !childNode.move) {
            return '';
        }

        const parts = [];

        childNode.commentsBefore.forEach(comment => {
            parts.push(this.serializeComment(comment));
        });

        parts.push(this.formatMoveWithNumber(parentNode.fen, childNode.move));

        const suffix = this.serializeSuffix(childNode);
        if (suffix) {
            parts.push(suffix);
        }

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    serializeBranchFrom(parentNode, childNode) {
        if (!parentNode || !childNode) {
            return '';
        }

        const parts = [this.serializeMove(parentNode, childNode)];
        const continuation = this.serializeFromNode(childNode);
        if (continuation) {
            parts.push(continuation);
        }

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    serializeFromNode(node) {
        if (!node || node.children.length === 0) {
            return '';
        }

        const mainChild = node.children[0];
        const parts = [this.serializeMove(node, mainChild)];

        for (let i = 1; i < node.children.length; i++) {
            const variationText = this.serializeBranchFrom(node, node.children[i]);
            if (variationText) {
                parts.push(`(${variationText})`);
            }
        }

        const mainContinuation = this.serializeFromNode(mainChild);
        if (mainContinuation) {
            parts.push(mainContinuation);
        }

        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    serializeCanonical(document) {
        if (!document || !document.root) {
            return '';
        }

        const headerText = (document.headers || [])
            .map(header => `[${header.key} "${escapeHeaderValue(header.value)}"]`)
            .join('\n');

        const moveText = this.serializeFromNode(document.root);
        const withResult = document.result
            ? (moveText ? `${moveText} ${document.result}` : document.result)
            : moveText;

        if (headerText && withResult) {
            return `${headerText}\n\n${withResult}`.trim();
        }

        return (headerText || withResult || '').trim();
    }

    serialize(document) {
        if (!document) {
            return '';
        }

        if (!document.isDirty && typeof document.originalText === 'string') {
            return document.originalText.trim();
        }

        return this.serializeCanonical(document);
    }
}

// Navigation controller for the move tree
class MoveTreeNavigator {
    constructor() {
        this.root = null;
        this.currentNode = null;
        this.document = null;
        this.parser = new PgnParser();
    }

    loadPgn(pgn, startingFen) {
        this.document = this.parser.parseDocument(pgn, startingFen);
        this.root = this.document.root;
        this.currentNode = this.root;
        return this.root;
    }

    serializePgn() {
        return this.parser.serialize(this.document);
    }

    markDirty() {
        if (this.document) {
            this.document.isDirty = true;
        }
    }

    // Get current FEN
    getCurrentFen() {
        return this.currentNode ? this.currentNode.fen : null;
    }

    // Get current move name
    getCurrentMove() {
        return this.currentNode ? this.currentNode.move : null;
    }

    // Move forward (main line by default)
    next(variationIndex = 0) {
        if (!this.currentNode || this.currentNode.children.length === 0) {
            return false;
        }
        const index = Math.min(variationIndex, this.currentNode.children.length - 1);
        this.currentNode = this.currentNode.children[index];
        return true;
    }

    // Move backward
    prev() {
        if (!this.currentNode || !this.currentNode.parent) {
            return false;
        }
        this.currentNode = this.currentNode.parent;
        return true;
    }

    // Go to root
    goToStart() {
        if (this.root) {
            this.currentNode = this.root;
            return true;
        }
        return false;
    }

    // Go to a specific node
    goToNode(node) {
        this.currentNode = node;
    }

    // Check if we can go forward
    canGoNext() {
        return this.currentNode && this.currentNode.children.length > 0;
    }

    // Check if we can go backward
    canGoPrev() {
        return this.currentNode && this.currentNode.parent !== null;
    }

    // Get available moves from current position
    getAvailableMoves() {
        if (!this.currentNode) return [];
        return this.currentNode.children.map((child, index) => ({
            move: child.move,
            index: index,
            isMainLine: index === 0
        }));
    }

    // Check if current position has variations
    hasVariations() {
        return this.currentNode && this.currentNode.children.length > 1;
    }

    // Get the path from root to current node (for highlighting)
    getPathFromRoot() {
        const path = [];
        let node = this.currentNode;
        while (node && node.parent) {
            path.unshift(node);
            node = node.parent;
        }
        return path;
    }
}

// Render PGN as clickable HTML
class PgnRenderer {
    constructor(navigator, onMoveClick) {
        this.navigator = navigator;
        this.onMoveClick = onMoveClick;
    }

    render() {
        if (!this.navigator.root) return '';

        const game = new (resolveChessCtor())();
        game.load(this.navigator.root.fen);

        return this.renderNode(this.navigator.root, game, true);
    }

    renderNode(node, game, isMainLine) {
        let html = '';

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const isVariation = i > 0;

            // Load position to get move number
            game.load(node.fen);
            const turnBefore = game.turn();
            const fullMoveNumber = parseInt(node.fen.split(' ')[5], 10);

            // Make the move to update game state
            game.move(child.move, { sloppy: true });

            // Determine move number display
            let moveNumStr = '';
            if (turnBefore === 'w') {
                moveNumStr = fullMoveNumber + '. ';
            } else if (isVariation || i === 0 && node.parent === null) {
                // Show move number for black if it's start of variation
                moveNumStr = fullMoveNumber + '... ';
            }

            // Check if this move is on current path
            const isCurrent = child === this.navigator.currentNode;
            const isOnPath = this.isNodeOnCurrentPath(child);
            const isBranchPoint = child.children.length > 1;

            let className = 'pgn-move';
            if (isCurrent) className += ' pgn-move-current';
            else if (isOnPath) className += ' pgn-move-on-path';
            if (isBranchPoint) className += ' pgn-move-branch';

            if (isVariation) {
                html += '<span class="pgn-variation">(';
            }

            html += `<span class="${className}" data-node-id="${this.getNodeId(child)}">${moveNumStr}${child.move}</span> `;

            // Recursively render children
            if (child.children.length > 0) {
                html += this.renderNode(child, game, isMainLine && !isVariation);
            }

            if (isVariation) {
                html += ')</span> ';
            }

            // Reset game state for next sibling
            game.load(node.fen);
        }

        return html;
    }

    isNodeOnCurrentPath(node) {
        const path = this.navigator.getPathFromRoot();
        return path.includes(node);
    }

    getNodeId(node) {
        // Generate unique ID for each node based on its path
        const path = [];
        let current = node;
        while (current && current.parent) {
            const parentIndex = current.parent.children.indexOf(current);
            path.unshift(parentIndex);
            current = current.parent;
        }
        return path.join('-');
    }

    // Build a map from node IDs to nodes for click handling
    buildNodeMap() {
        const map = new Map();
        this.buildNodeMapRecursive(this.navigator.root, map);
        return map;
    }

    buildNodeMapRecursive(node, map) {
        for (const child of node.children) {
            const id = this.getNodeId(child);
            map.set(id, child);
            this.buildNodeMapRecursive(child, map);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEFAULT_STARTING_FEN,
        MoveNode,
        PgnParser,
        MoveTreeNavigator,
        PgnRenderer,
        parseVendorTagsFromComment
    };
}
