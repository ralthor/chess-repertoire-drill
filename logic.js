// Move tree node - represents a position and how we got there
class MoveNode {
    constructor(move, fen, parent = null) {
        this.move = move;      // SAN notation (e.g., "Nf3"), null for root
        this.fen = fen;        // Board state after this move
        this.children = [];    // Next moves (main line first, then variations)
        this.parent = parent;  // To navigate back
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

// PGN Parser that handles variations
class PgnParser {
    constructor() {
        this.game = new Chess();
    }

    // Tokenize PGN into meaningful tokens
    tokenize(pgn) {
        const tokens = [];
        // Remove comments in curly braces
        pgn = pgn.replace(/\{[^}]*\}/g, '');
        // Remove header tags
        pgn = pgn.replace(/\[[^\]]*\]/g, '');
        // Remove result markers
        pgn = pgn.replace(/1-0|0-1|1\/2-1\/2|\*/g, '');
        
        let current = '';
        for (let i = 0; i < pgn.length; i++) {
            const char = pgn[i];
            if (char === '(' || char === ')') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push(char);
            } else if (/\s/.test(char)) {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            tokens.push(current.trim());
        }

        // Filter out move numbers (e.g., "1.", "12.", "1...")
        return tokens.filter(t => !(/^\d+\.+$/.test(t)));
    }

    // Parse PGN and build move tree
    parse(pgn, startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        const tokens = this.tokenize(pgn);
        this.game.load(startingFen);
        
        const root = new MoveNode(null, startingFen, null);
        this.parseTokens(tokens, 0, root);
        return root;
    }

    // Recursive token parser
    parseTokens(tokens, index, currentNode) {
        let node = currentNode;
        
        while (index < tokens.length) {
            const token = tokens[index];
            
            if (token === '(') {
                // Start of variation - go back to parent to branch from there
                const branchPoint = node.parent;
                if (branchPoint) {
                    // Save current game state
                    const savedFen = this.game.fen();
                    // Load the position before the last move (the branch point)
                    this.game.load(branchPoint.fen);
                    // Parse the variation
                    index = this.parseTokens(tokens, index + 1, branchPoint);
                    // Restore game state to continue main line
                    this.game.load(savedFen);
                } else {
                    index++;
                }
            } else if (token === ')') {
                // End of variation
                return index + 1;
            } else {
                // It's a move
                this.game.load(node.fen);
                const moveResult = this.game.move(token);
                if (moveResult) {
                    const newNode = new MoveNode(token, this.game.fen());
                    node.addChild(newNode);
                    node = newNode;
                }
                index++;
            }
        }
        
        return index;
    }
}

// Navigation controller for the move tree
class MoveTreeNavigator {
    constructor() {
        this.root = null;
        this.currentNode = null;
        this.parser = new PgnParser();
    }

    loadPgn(pgn, startingFen) {
        this.root = this.parser.parse(pgn, startingFen);
        this.currentNode = this.root;
        return this.root;
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
        
        const game = new Chess();
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
            const fullMoveNumber = parseInt(node.fen.split(' ')[5]);
            
            // Make the move to update game state
            game.move(child.move);
            
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
            
            let className = 'pgn-move';
            if (isCurrent) className += ' pgn-move-current';
            else if (isOnPath) className += ' pgn-move-on-path';
            
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
