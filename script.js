class ChessCell {
    constructor(row, rank, piece) {
        this.row = row;
        this.rank = rank;
        this.piece = piece;
        return this;
    }
}

var globalBoard = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var whiteView = true;
var clickedSquare = null;
var cellMap = new Map();

// New tree-based navigation
var moveNavigator = null;
var renderer = null;
var nodeMap = new Map();
var wrongMoveSquares = null;
var promotionResolver = null;
var feedbackTimer = null;
var dragPointerId = null;
var dragSourceSquareId = null;
var dragSourceElement = null;
var dragPieceCode = null;
var dragStartClientX = 0;
var dragStartClientY = 0;
var dragPreview = null;
var dragCurrentTargetId = null;
var isDragActive = false;
var suppressNextClick = false;
var activeCommentText = '';
var activeBoardAnnotations = { cal: [], csl: [] };

const DRAG_THRESHOLD_PX = 8;
const ANNOTATION_COLOR_MAP = {
    G: '#49c866',
    R: '#ff6b6b',
    Y: '#e8c547',
    B: '#5f9bff'
};

function clearMoveFeedback() {
    wrongMoveSquares = null;
    if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
    }
    const warning = document.getElementById('moveWarning');
    if (!warning) return;
    warning.textContent = '';
    warning.classList.remove('active');
    warning.classList.remove('info');
}

function showMoveFeedback(message, mode = 'warning', wrongMove = null, autoHideMs = 0) {
    wrongMoveSquares = wrongMove ? { from: wrongMove.from, to: wrongMove.to } : null;
    if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
    }
    const warning = document.getElementById('moveWarning');
    if (!warning) return;
    warning.textContent = message;
    warning.classList.add('active');
    warning.classList.toggle('info', mode === 'info');
    if (autoHideMs > 0) {
        feedbackTimer = setTimeout(function() {
            clearMoveFeedback();
            setupBoard(globalBoard);
        }, autoHideMs);
    }
}

function showMoveWarning(message, wrongMove = null) {
    showMoveFeedback(message, 'warning', wrongMove, 0);
}

function showInfoMessage(message) {
    showMoveFeedback(message, 'info', null, 2200);
}

function isValidSquareId(squareId) {
    return /^[a-h][1-8]$/.test(squareId || '');
}

function getCurrentNodeAnnotationPayload(node) {
    if (!node) {
        return { text: '', tags: { cal: [], csl: [] } };
    }

    const comments = []
        .concat(node.commentsBefore || [])
        .concat(node.commentsAfter || []);

    const textParts = [];
    const arrows = [];
    const squares = [];
    const seenArrows = new Set();
    const seenSquares = new Set();

    comments.forEach(comment => {
        const normalizedText = (comment && comment.text ? comment.text : '').trim();
        if (normalizedText) {
            textParts.push(normalizedText);
        }

        const tagData = comment && comment.tags ? comment.tags : {};
        (tagData.cal || []).forEach(arrow => {
            if (!arrow || !ANNOTATION_COLOR_MAP[arrow.color]) return;
            if (!isValidSquareId(arrow.from) || !isValidSquareId(arrow.to)) return;
            const key = `${arrow.color}:${arrow.from}:${arrow.to}`;
            if (seenArrows.has(key)) return;
            seenArrows.add(key);
            arrows.push({
                color: arrow.color,
                from: arrow.from,
                to: arrow.to
            });
        });

        (tagData.csl || []).forEach(square => {
            if (!square || !ANNOTATION_COLOR_MAP[square.color]) return;
            if (!isValidSquareId(square.square)) return;
            const key = `${square.color}:${square.square}`;
            if (seenSquares.has(key)) return;
            seenSquares.add(key);
            squares.push({
                color: square.color,
                square: square.square
            });
        });
    });

    return {
        text: textParts.join('\n\n'),
        tags: {
            cal: arrows,
            csl: squares
        }
    };
}

function updateCurrentCommentPanel(commentText) {
    const panel = document.getElementById('currentCommentPanel');
    const textEl = document.getElementById('currentCommentText');
    if (!panel || !textEl) return;

    const text = (commentText || '').trim();
    if (!text) {
        panel.classList.add('empty');
        textEl.textContent = 'No comment for current move.';
        return;
    }

    panel.classList.remove('empty');
    textEl.textContent = text;
}

function setActiveAnnotationsFromCurrentNode() {
    const payload = getCurrentNodeAnnotationPayload(moveNavigator ? moveNavigator.currentNode : null);
    activeCommentText = payload.text;
    activeBoardAnnotations = payload.tags;
    updateCurrentCommentPanel(activeCommentText);
}

function createSvgElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}

function getSquareCenterInBoard(squareId, boardRect) {
    if (!boardRect || !isValidSquareId(squareId)) {
        return null;
    }

    const file = squareId.charCodeAt(0) - 97; // a -> 0
    const rank = parseInt(squareId[1], 10);   // 1..8
    const squareSize = boardRect.width / 8;

    if (squareSize <= 0) {
        return null;
    }

    const xIndex = whiteView ? file : 7 - file;
    const yIndex = whiteView ? 8 - rank : rank - 1;

    return {
        x: (xIndex + 0.5) * squareSize,
        y: (yIndex + 0.5) * squareSize,
        squareSize
    };
}

function renderBoardAnnotations() {
    const overlay = document.getElementById('annotationOverlay');
    const board = document.getElementById('chessboard');
    const boardContainer = document.getElementById('chessboardContainer');
    if (!overlay || !board || !boardContainer) return;

    const boardRect = board.getBoundingClientRect();
    const width = boardRect.width;
    const height = boardRect.height;

    overlay.innerHTML = '';
    if (width <= 0 || height <= 0) {
        return;
    }

    boardContainer.style.width = `${width}px`;
    boardContainer.style.height = `${height}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;

    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('width', width);
    overlay.setAttribute('height', height);

    const highlights = (activeBoardAnnotations && activeBoardAnnotations.csl) ? activeBoardAnnotations.csl : [];
    highlights.forEach(mark => {
        const color = ANNOTATION_COLOR_MAP[mark.color];
        if (!color) return;
        const center = getSquareCenterInBoard(mark.square, boardRect);
        if (!center) return;
        const size = center.squareSize * 0.8;

        const highlight = createSvgElement('rect');
        highlight.setAttribute('x', center.x - size / 2);
        highlight.setAttribute('y', center.y - size / 2);
        highlight.setAttribute('width', size);
        highlight.setAttribute('height', size);
        highlight.setAttribute('rx', center.squareSize * 0.18);
        highlight.setAttribute('ry', center.squareSize * 0.18);
        highlight.setAttribute('fill', color);
        highlight.setAttribute('fill-opacity', '0.34');
        overlay.appendChild(highlight);
    });

    const arrows = (activeBoardAnnotations && activeBoardAnnotations.cal) ? activeBoardAnnotations.cal : [];
    arrows.forEach(arrow => {
        const color = ANNOTATION_COLOR_MAP[arrow.color];
        if (!color) return;
        const start = getSquareCenterInBoard(arrow.from, boardRect);
        const end = getSquareCenterInBoard(arrow.to, boardRect);
        if (!start || !end) return;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) return;

        const averageSquare = (start.squareSize + end.squareSize) / 2;
        const unitX = dx / distance;
        const unitY = dy / distance;
        const startOffset = averageSquare * 0.16;
        const headLength = Math.max(12, averageSquare * 0.52);
        const headWidth = Math.max(11, averageSquare * 0.42);
        const lineStartX = start.x + unitX * startOffset;
        const lineStartY = start.y + unitY * startOffset;
        const lineEndX = end.x - unitX * headLength;
        const lineEndY = end.y - unitY * headLength;

        const shaft = createSvgElement('line');
        shaft.setAttribute('x1', lineStartX);
        shaft.setAttribute('y1', lineStartY);
        shaft.setAttribute('x2', lineEndX);
        shaft.setAttribute('y2', lineEndY);
        shaft.setAttribute('stroke', color);
        shaft.setAttribute('stroke-opacity', '0.46');
        shaft.setAttribute('stroke-width', Math.max(6, averageSquare * 0.23));
        shaft.setAttribute('stroke-linecap', 'round');
        overlay.appendChild(shaft);

        const perpX = -unitY;
        const perpY = unitX;
        const baseLeftX = lineEndX + perpX * (headWidth / 2);
        const baseLeftY = lineEndY + perpY * (headWidth / 2);
        const baseRightX = lineEndX - perpX * (headWidth / 2);
        const baseRightY = lineEndY - perpY * (headWidth / 2);

        const head = createSvgElement('polygon');
        head.setAttribute('points', `${end.x},${end.y} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`);
        head.setAttribute('fill', color);
        head.setAttribute('fill-opacity', '0.46');
        overlay.appendChild(head);

        const startDot = createSvgElement('circle');
        startDot.setAttribute('cx', lineStartX);
        startDot.setAttribute('cy', lineStartY);
        startDot.setAttribute('r', Math.max(2.6, averageSquare * 0.1));
        startDot.setAttribute('fill', color);
        startDot.setAttribute('fill-opacity', '0.46');
        overlay.appendChild(startDot);
    });
}

function getPromotionPieceSymbol(color, promotion) {
    return color === 'w' ? promotion.toUpperCase() : promotion;
}

function closePromotionOverlay(selection = null) {
    const overlay = document.getElementById('promotionOverlay');
    const choices = document.getElementById('promotionChoices');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('promotion-open');
    if (choices) {
        choices.innerHTML = '';
    }

    if (promotionResolver) {
        const resolve = promotionResolver;
        promotionResolver = null;
        resolve(selection);
    }
}

function openPromotionOverlay(color) {
    const overlay = document.getElementById('promotionOverlay');
    const choices = document.getElementById('promotionChoices');
    if (!overlay || !choices) {
        return Promise.resolve('q');
    }

    if (promotionResolver) {
        closePromotionOverlay(null);
    }

    const options = ['q', 'r', 'b', 'n'];
    choices.innerHTML = '';

    options.forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'promotion-choice';
        btn.innerHTML = `
            <span class="promotion-choice-piece">${getPieceSVG(getPromotionPieceSymbol(color, option))}</span>
        `;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closePromotionOverlay(option);
        });
        choices.appendChild(btn);
    });

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('promotion-open');

    return new Promise(resolve => {
        promotionResolver = resolve;
    });
}

function initializePromotionOverlayEvents() {
    const overlay = document.getElementById('promotionOverlay');
    const dialog = document.getElementById('promotionDialog');

    if (dialog) {
        dialog.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', function() {
            if (promotionResolver) {
                closePromotionOverlay(null);
            }
        });
    }
}

function isPromotionMove(game, move) {
    const piece = game.get(move.from);
    if (!piece || piece.type !== 'p') {
        return false;
    }
    if (piece.color !== game.turn()) {
        return false;
    }
    return (piece.color === 'w' && move.to[1] === '8') || (piece.color === 'b' && move.to[1] === '1');
}

function canDragFromSquare(squareId) {
    if (!squareId) return false;
    const game = new Chess();
    game.load(globalBoard);
    const piece = game.get(squareId);
    return !!(piece && piece.color === game.turn());
}

function getSquareIdFromDomTarget(target) {
    let current = target;
    while (current && current !== document.body) {
        if (current.parentElement && current.parentElement.id === 'chessboard' && cellMap.has(current.id)) {
            return current.id;
        }
        current = current.parentElement;
    }
    return null;
}

function getSquareIdFromPoint(clientX, clientY) {
    return getSquareIdFromDomTarget(document.elementFromPoint(clientX, clientY));
}

function clearDragTargetHighlight() {
    if (!dragCurrentTargetId) return;
    const oldTarget = document.getElementById(dragCurrentTargetId);
    if (oldTarget) {
        oldTarget.classList.remove('drag-target');
    }
    dragCurrentTargetId = null;
}

function setDragTargetHighlight(squareId) {
    if (dragCurrentTargetId === squareId) return;
    clearDragTargetHighlight();
    if (!squareId || squareId === dragSourceSquareId) return;
    const targetSquare = document.getElementById(squareId);
    if (!targetSquare) return;
    targetSquare.classList.add('drag-target');
    dragCurrentTargetId = squareId;
}

function createDragPreview(pieceCode) {
    if (!pieceCode) return null;
    const preview = document.createElement('div');
    preview.className = 'dragging-piece';
    preview.innerHTML = getPieceSVG(pieceCode);
    document.body.appendChild(preview);
    return preview;
}

function moveDragPreview(clientX, clientY) {
    if (!dragPreview) return;
    dragPreview.style.left = `${clientX}px`;
    dragPreview.style.top = `${clientY}px`;
}

function removeDragPreview() {
    if (!dragPreview) return;
    dragPreview.remove();
    dragPreview = null;
}

function resetDragState(consumeNextClick) {
    if (dragSourceElement && dragPointerId !== null && dragSourceElement.hasPointerCapture) {
        try {
            if (dragSourceElement.hasPointerCapture(dragPointerId)) {
                dragSourceElement.releasePointerCapture(dragPointerId);
            }
        } catch (err) {
            // Ignore capture-release errors during teardown.
        }
    }

    if (dragSourceSquareId) {
        const sourceEl = document.getElementById(dragSourceSquareId);
        if (sourceEl) {
            sourceEl.classList.remove('drag-source');
        }
    }

    clearDragTargetHighlight();
    removeDragPreview();

    dragPointerId = null;
    dragSourceSquareId = null;
    dragSourceElement = null;
    dragPieceCode = null;
    dragStartClientX = 0;
    dragStartClientY = 0;
    isDragActive = false;
    document.body.classList.remove('dragging-board');

    if (consumeNextClick) {
        suppressNextClick = true;
    }
}

function beginDragCandidate(event, square) {
    if (!square) return;
    if (dragPointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const sourceSquareId = square.id;
    const sourceCell = cellMap.get(sourceSquareId);
    if (!sourceCell || sourceCell.piece === '.' || !canDragFromSquare(sourceSquareId)) {
        return;
    }

    dragPointerId = event.pointerId;
    dragSourceSquareId = sourceSquareId;
    dragSourceElement = square;
    dragPieceCode = sourceCell.piece;
    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;
    isDragActive = false;

    if (square.setPointerCapture) {
        try {
            square.setPointerCapture(event.pointerId);
        } catch (err) {
            // Ignore capture errors if browser denies capture in edge cases.
        }
    }
}

function onGlobalPointerMove(event) {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;

    const dx = event.clientX - dragStartClientX;
    const dy = event.clientY - dragStartClientY;
    const distance = Math.hypot(dx, dy);

    if (!isDragActive) {
        if (distance < DRAG_THRESHOLD_PX) {
            return;
        }
        isDragActive = true;
        clickedSquare = null;
        clearMoveFeedback();
        document.body.classList.add('dragging-board');
        const sourceEl = dragSourceSquareId ? document.getElementById(dragSourceSquareId) : null;
        if (sourceEl) {
            sourceEl.classList.add('drag-source');
        }
        dragPreview = createDragPreview(dragPieceCode);
    }

    if (event.cancelable) {
        event.preventDefault();
    }

    moveDragPreview(event.clientX, event.clientY);
    setDragTargetHighlight(getSquareIdFromPoint(event.clientX, event.clientY));
}

async function onGlobalPointerUp(event) {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;

    const sourceSquareId = dragSourceSquareId;
    const wasDrag = isDragActive;
    const destinationSquareId = wasDrag ? getSquareIdFromPoint(event.clientX, event.clientY) : null;

    resetDragState(wasDrag);

    if (!wasDrag) {
        return;
    }

    if (!sourceSquareId || !destinationSquareId || sourceSquareId === destinationSquareId) {
        clickedSquare = null;
        setupBoard(globalBoard);
        return;
    }

    await attemptMove(sourceSquareId, destinationSquareId);
}

function onGlobalPointerCancel(event) {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;
    const hadActiveDrag = isDragActive;
    resetDragState(hadActiveDrag);
    if (hadActiveDrag) {
        clickedSquare = null;
        setupBoard(globalBoard);
    }
}

async function attemptMove(fromSquareId, toSquareId) {
    const move = {
        from: fromSquareId,
        to: toSquareId
    };

    const game = new Chess();
    game.load(globalBoard);

    let moveToPlay = {
        from: move.from,
        to: move.to
    };

    if (isPromotionMove(game, moveToPlay)) {
        clickedSquare = null;
        setupBoard(globalBoard);
        const promotion = await openPromotionOverlay(game.turn());
        if (!promotion) {
            return false;
        }
        moveToPlay.promotion = promotion;
    }

    const moveResult = game.move(moveToPlay);
    if (!moveResult) {
        clickedSquare = null;
        setupBoard(globalBoard);
        return false;
    }

    clickedSquare = null;

    if (moveNavigator && moveNavigator.currentNode) {
        const continuations = moveNavigator.currentNode.children || [];
        const nextFen = game.fen();
        const matchingNode = continuations.find(child => child.fen === nextFen);
        if (matchingNode) {
            moveNavigator.goToNode(matchingNode);
            syncUiToNavigator();
            return true;
        }

        if (isMoveAdditionUnlocked()) {
            addMoveToTree(moveResult.san, nextFen);
            syncUiToNavigator();
            return true;
        }

        if (continuations.length === 0) {
            showMoveWarning('No more PGN moves are available from this position.', move);
            syncUiToNavigator(false);
            return false;
        }

        showMoveWarning(`Move ${moveResult.san} is not in this PGN branch.`, move);
        syncUiToNavigator(false);
        return false;
    }

    clearMoveFeedback();
    globalBoard = game.fen();
    setupBoard(globalBoard);
    return true;
}

function isMoveAdditionUnlocked() {
    const unlockToggle = document.getElementById('unlockAddMoves');
    return !!(unlockToggle && unlockToggle.checked);
}

function updateUnlockControlState() {
    const control = document.getElementById('unlockControl');
    if (!control) return;
    control.classList.toggle('unlocked', isMoveAdditionUnlocked());
}

function addMoveToTree(moveSan, fen) {
    if (!moveNavigator || !moveNavigator.currentNode) return null;

    const parent = moveNavigator.currentNode;
    const existing = parent.children.find(child => child.fen === fen);
    if (existing) {
        moveNavigator.goToNode(existing);
        return existing;
    }

    const newNode = new MoveNode(moveSan, fen);
    parent.addChild(newNode);
    moveNavigator.goToNode(newNode);
    moveNavigator.markDirty();
    return newNode;
}

function buildExportPgn() {
    if (!moveNavigator || !moveNavigator.root || !moveNavigator.document) {
        return '';
    }
    return moveNavigator.serializePgn();
}

function copyTextFallback(text) {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    temp.style.pointerEvents = 'none';
    document.body.appendChild(temp);
    temp.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (err) {
        copied = false;
    }
    document.body.removeChild(temp);
    return copied;
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (err) {
        // Fall through to legacy copy path.
    }
    return copyTextFallback(text);
}

function isPgnImportOverlayOpen() {
    const overlay = document.getElementById('pgnImportOverlay');
    return !!(overlay && overlay.classList.contains('active'));
}

function isFenImportOverlayOpen() {
    const overlay = document.getElementById('fenImportOverlay');
    return !!(overlay && overlay.classList.contains('active'));
}

function closePgnImportOverlay() {
    const overlay = document.getElementById('pgnImportOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('import-open');
}

function openPgnImportOverlay() {
    closeFenImportOverlay();
    const overlay = document.getElementById('pgnImportOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('import-open');
}

function closeFenImportOverlay() {
    const overlay = document.getElementById('fenImportOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('import-open');
}

function openFenImportOverlay() {
    closePgnImportOverlay();
    const overlay = document.getElementById('fenImportOverlay');
    const fenInput = document.getElementById('fenImportInput');
    if (!overlay) return;
    if (fenInput) {
        fenInput.value = globalBoard;
    }
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('import-open');
}

function loadPgnFromText(rawPgn) {
    if (!moveNavigator) return false;
    const pgn = (rawPgn || '').trim();
    if (!pgn) {
        showMoveWarning('PGN input is empty.');
        return false;
    }

    moveNavigator.loadPgn(pgn, startingFen);
    renderer = new PgnRenderer(moveNavigator, onPgnMoveClick);
    nodeMap = renderer.buildNodeMap();
    syncUiToNavigator();
    return true;
}

function loadPgnFromImportOverlay() {
    const pgnInput = document.getElementById('pgnImportText');
    if (!pgnInput) return;
    if (loadPgnFromText(pgnInput.value)) {
        pgnInput.value = pgnInput.value.trim();
        closePgnImportOverlay();
    }
}

function loadFenFromImportOverlay() {
    const fenInput = document.getElementById('fenImportInput');
    if (!fenInput) return;
    const fen = fenInput.value.trim();
    if (!fen) {
        showMoveWarning('FEN input is empty.');
        return;
    }

    const game = new Chess();
    const isValidFen = game.load(fen);
    if (!isValidFen) {
        showMoveWarning('FEN is invalid.');
        return;
    }

    clearMoveFeedback();
    clickedSquare = null;
    globalBoard = game.fen();
    setupBoard(globalBoard);
    closeFenImportOverlay();
}

async function exportPgnFromTree() {
    const pgn = buildExportPgn();
    if (!pgn) {
        showInfoMessage('No PGN moves to export.');
        return;
    }

    const copied = await copyTextToClipboard(pgn);
    if (copied) {
        showInfoMessage('PGN copied.');
        return;
    }

    const pgnInput = document.getElementById('pgnImportText');
    if (pgnInput) {
        pgnInput.value = pgn;
    }
    openPgnImportOverlay();
    showInfoMessage('Clipboard unavailable. PGN opened for manual copy.');
}

async function exportCurrentFen() {
    const fen = globalBoard;
    if (!fen) {
        showInfoMessage('No FEN to export.');
        return;
    }

    const copied = await copyTextToClipboard(fen);
    if (copied) {
        showInfoMessage('FEN copied.');
        return;
    }

    const fenInput = document.getElementById('fenImportInput');
    if (fenInput) {
        fenInput.value = fen;
    }
    openFenImportOverlay();
    showInfoMessage('Clipboard unavailable. FEN opened for manual copy.');
}

function openLichessAnalysis() {
    const fen = (globalBoard || '').trim();
    if (!fen) {
        showInfoMessage('No FEN available for analysis.');
        return;
    }

    const fenPath = fen.replace(/ /g, '_');
    const analysisUrl = `https://lichess.org/analysis/${fenPath}`;
    const win = window.open(analysisUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
        showMoveWarning('Could not open analysis tab. Check popup blocker settings.');
    }
}

function initializeImportOverlayEvents() {
    const pgnOverlay = document.getElementById('pgnImportOverlay');
    const pgnDialog = pgnOverlay ? pgnOverlay.querySelector('.importDialog') : null;
    const fenOverlay = document.getElementById('fenImportOverlay');
    const fenDialog = fenOverlay ? fenOverlay.querySelector('.importDialog') : null;

    if (pgnDialog) {
        pgnDialog.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    if (fenDialog) {
        fenDialog.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    if (pgnOverlay) {
        pgnOverlay.addEventListener('click', function() {
            closePgnImportOverlay();
        });
    }

    if (fenOverlay) {
        fenOverlay.addEventListener('click', function() {
            closeFenImportOverlay();
        });
    }
}

function syncUiToNavigator(clearFeedback = true) {
    if (!moveNavigator) return;
    if (clearFeedback) {
        clearMoveFeedback();
    }
    if (renderer) {
        nodeMap = renderer.buildNodeMap();
    }
    setActiveAnnotationsFromCurrentNode();
    globalBoard = moveNavigator.getCurrentFen();
    setupBoard(globalBoard);
    renderPgnDisplay();
    updateVariationButtons();
}

document.addEventListener('DOMContentLoaded', function() {
    updateCurrentCommentPanel('');
    setupBoard(globalBoard);
    updateUnlockControlState();
    initializePromotionOverlayEvents();
    initializeImportOverlayEvents();
    document.addEventListener('pointermove', onGlobalPointerMove, { passive: false });
    document.addEventListener('pointerup', onGlobalPointerUp);
    document.addEventListener('pointercancel', onGlobalPointerCancel);
    window.addEventListener('resize', renderBoardAnnotations);
    
    // Initialize moveNavigator
    moveNavigator = new MoveTreeNavigator();
    // Auto-load PGN from import panel content.
    const pgnImportText = document.getElementById('pgnImportText');
    loadPgnFromText(pgnImportText ? pgnImportText.value : '');
});

document.getElementById('importPgnBtn').addEventListener('click', function() {
    openPgnImportOverlay();
});

document.getElementById('importFenBtn').addEventListener('click', function() {
    openFenImportOverlay();
});

document.getElementById('unlockAddMoves').addEventListener('change', function() {
    updateUnlockControlState();
});

document.getElementById('exportPgn').addEventListener('click', function() {
    exportPgnFromTree();
});

document.getElementById('exportFen').addEventListener('click', function() {
    exportCurrentFen();
});

document.getElementById('analysisBtn').addEventListener('click', function() {
    openLichessAnalysis();
});

document.getElementById('loadPgnFromOverlay').addEventListener('click', function() {
    loadPgnFromImportOverlay();
});

document.getElementById('closePgnOverlay').addEventListener('click', function() {
    closePgnImportOverlay();
});

document.getElementById('loadFenFromOverlay').addEventListener('click', function() {
    loadFenFromImportOverlay();
});

document.getElementById('closeFenOverlay').addEventListener('click', function() {
    closeFenImportOverlay();
});

function onPgnMoveClick(node) {
    moveNavigator.goToNode(node);
    syncUiToNavigator();
}

function renderPgnDisplay() {
    if (!renderer) return;
    
    const pgnDisplay = document.getElementById('pgnDisplay');
    if (pgnDisplay) {
        pgnDisplay.innerHTML = renderer.render();
        
        // Add click handlers to all moves
        pgnDisplay.querySelectorAll('.pgn-move').forEach(el => {
            el.addEventListener('click', function() {
                const nodeId = this.getAttribute('data-node-id');
                const node = nodeMap.get(nodeId);
                if (node) {
                    onPgnMoveClick(node);
                }
            });
        });
        
        // Scroll current move into view
        const currentMove = pgnDisplay.querySelector('.pgn-move-current');
        if (currentMove) {
            const displayRect = pgnDisplay.getBoundingClientRect();
            const moveRect = currentMove.getBoundingClientRect();
            const margin = 16;
            if (moveRect.top < displayRect.top + margin) {
                pgnDisplay.scrollTop += moveRect.top - displayRect.top - margin;
            } else if (moveRect.bottom > displayRect.bottom - margin) {
                pgnDisplay.scrollTop += moveRect.bottom - displayRect.bottom + margin;
            }
        }
    }
}

function updateVariationButtons() {
    const container = document.getElementById('variationButtons');
    const indicator = document.getElementById('branchIndicator');
    if (!container || !moveNavigator) return;
    
    container.innerHTML = '';
    
    const availableMoves = moveNavigator.getAvailableMoves();
    if (availableMoves.length <= 1) {
        container.style.display = 'none';
        if (indicator) {
            indicator.classList.remove('active');
        }
        return;
    }
    
    // Show branch indicator
    if (indicator) {
        indicator.classList.add('active');
        indicator.innerHTML = `<strong>Branch point!</strong> ${availableMoves.length} options available. Use <kbd>Up/Down</kbd> arrows or click below:`;
    }
    
    container.style.display = 'flex';
    
    availableMoves.forEach((moveInfo, idx) => {
        const btn = document.createElement('button');
        btn.className = 'variation-btn';
        if (moveInfo.isMainLine) {
            btn.classList.add('main-line');
        }
        btn.textContent = moveInfo.move;
        btn.title = moveInfo.isMainLine ? 'Main line' : `Variation ${idx}`;
        btn.addEventListener('click', () => {
            moveNavigator.next(idx);
            syncUiToNavigator();
        });
        container.appendChild(btn);
    });
}

document.getElementById('nextMove').addEventListener('click', function() {
    if (!moveNavigator || !moveNavigator.canGoNext()) {
        return;
    }
    moveNavigator.next(0); // Main line by default
    syncUiToNavigator();
});

document.getElementById('prevMove').addEventListener('click', function() {
    if (!moveNavigator || !moveNavigator.canGoPrev()) {
        return;
    }
    moveNavigator.prev();
    syncUiToNavigator();
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    if (promotionResolver) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closePromotionOverlay(null);
        }
        return;
    }

    if (dragPointerId !== null && e.key === 'Escape') {
        e.preventDefault();
        const hadActiveDrag = isDragActive;
        resetDragState(true);
        if (hadActiveDrag) {
            clickedSquare = null;
            setupBoard(globalBoard);
        }
        return;
    }

    if (isPgnImportOverlayOpen() || isFenImportOverlayOpen()) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closePgnImportOverlay();
            closeFenImportOverlay();
        }
        return;
    }

    if (!moveNavigator) return;
    
    // Ignore if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch (e.key) {
        case 'ArrowRight':
            e.preventDefault();
            if (moveNavigator.canGoNext()) {
                moveNavigator.next(0);
                syncUiToNavigator();
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (moveNavigator.canGoPrev()) {
                moveNavigator.prev();
                syncUiToNavigator();
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            // Switch to previous variation at current branch
            switchVariation(-1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            // Switch to next variation at current branch
            switchVariation(1);
            break;
        case 'Home':
            e.preventDefault();
            moveNavigator.goToStart();
            syncUiToNavigator();
            break;
    }
});

function switchVariation(direction) {
    if (!moveNavigator || !moveNavigator.currentNode || !moveNavigator.currentNode.parent) {
        return;
    }
    
    const parent = moveNavigator.currentNode.parent;
    const currentIndex = parent.children.indexOf(moveNavigator.currentNode);
    const newIndex = currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < parent.children.length) {
        moveNavigator.goToNode(parent.children[newIndex]);
        syncUiToNavigator();
    }
}

document.getElementById('flipToggle').addEventListener('change', function() {
    resetDragState(false);
    if (this.checked) {
        whiteView = false;
    } else {
        whiteView = true;
    }
    setupBoard(globalBoard);
});

document.getElementById('chessboard').addEventListener('contextmenu', function(e) {
    e.preventDefault();
    resetDragState(false);
    clickedSquare = null;
    setupBoard(globalBoard);
});

// SVG Chess Pieces (cburnett style)
const pieceSVGs = {
    // White pieces
    'K': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#fff" d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>`,
    'Q': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z"/><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L6 14l3 12z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/></g></svg>`,
    'R': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/><path d="M34 14l-3 3H14l-3-3"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path fill="none" stroke-linejoin="miter" d="M11 14h23"/></g></svg>`,
    'B': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>`,
    'N': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#fff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#fff" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#000" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z"/></g></svg>`,
    'P': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    // Black pieces
    'k': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6"/><path fill="#000" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#000" d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/><path stroke-linejoin="miter" d="M20 8h5"/><path stroke="#fff" d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/></g></svg>`,
    'q': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path fill="#000" stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"/><path fill="#000" stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" stroke="#fff" d="M11.5 30c3.5-1 18.5-1 22 0m-21 2.5c5.5-1 15.5-1 21 0m-21 2.5c5.5-1 15.5-1 21 0"/></g></svg>`,
    'r': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9v3zm3.5-7l1.5-2.5h17l1.5 2.5h-20zm-.5 4v-4h21v4H12z"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M14 29.5v-13h17v13H14z"/><path stroke-linecap="butt" d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z"/><path fill="none" stroke="#fff" stroke-linejoin="miter" stroke-width="1" d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"/></g></svg>`,
    'b': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke="#fff" stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g></svg>`,
    'n': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#000" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#000" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#fff" stroke="#fff" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z"/><path fill="#fff" stroke="none" d="M24.55 10.4 24.1 11.85l.5.15c3.15 1 5.65 2.49 7.9 6.75 2.25 4.26 3.25 10.31 2.75 20.25h1.5c.5-10 .25-16.5-2-21.5s-6.25-6.5-9.7-7.1z"/></g></svg>`,
    'p': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>`
};

function getPieceSVG(piece) {
    return pieceSVGs[piece] || '';
}

function convertFenRankToUnicode(fenRank) {
    let unicodeRank = '';
    for (let i = 0; i < fenRank.length; i++) {
        let piece = fenRank[i];
        if (!isNaN(piece)) {
            for (let j = 0; j < parseInt(piece); j++) {
                unicodeRank += '.';
            }
        } else {
            unicodeRank += piece;
        }
    }
    return unicodeRank;
}

async function boardClick(event, target) {
    if (suppressNextClick) {
        suppressNextClick = false;
        return;
    }

    let square = target;
    let cell = cellMap.get(square.id);
    if (!cell) return;

    if (clickedSquare === null) {
        clearMoveFeedback();
        clickedSquare = cell;
        square.className = 'selected';
        return;
    }

    let move = {
        from: clickedSquare.rank + clickedSquare.row,
        to: cell.rank + cell.row
    };
    await attemptMove(move.from, move.to);
}

function setupBoard(fen) {
    cellMap.clear();
    let boardElement = document.getElementById('chessboard');
    boardElement.innerHTML = '';
    let rows = fen.split(' ')[0].split('/');

    let board = new Array();
    rows.forEach((row, rowIndex) => {
        board.push(convertFenRankToUnicode(row));
    });
    
    let rowNames = ['8', '7', '6', '5', '4', '3', '2', '1'];
    let rankNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let cellIsWhite = true;
    if (!whiteView) {
        rowNames = rowNames.reverse();
        rankNames = rankNames.reverse();
        board = board.reverse();
        board.forEach((row, rowIndex) => {
            board[rowIndex] = row.split('').reverse().join('');
        });
    }
    
    board.forEach((row, rowIndex) => {
        let cells = row.split('');
        cells.forEach((cell, cellIndex) => {
            let cellObject = new ChessCell(rowNames[rowIndex], rankNames[cellIndex], cell);
            let square = document.createElement('div');
            let id = rankNames[cellIndex] + rowNames[rowIndex];
            square.setAttribute('id', id);
            if (clickedSquare !== null && clickedSquare.rank + clickedSquare.row === cellObject.rank + cellObject.row) {
                square.className = 'selected';
            }
            else 
                square.className = cellIsWhite ? 'white' : 'black';
            if (wrongMoveSquares && (wrongMoveSquares.from === id || wrongMoveSquares.to === id)) {
                square.classList.add('wrong-move');
            }
            cellMap.set(id, cellObject);
            square.addEventListener('pointerdown', function(event) {
                beginDragCandidate(event, square);
            });
            square.addEventListener('click', function(event) {
                boardClick(event, square);
            });
            if (cell !== '.') {
                let piece = document.createElement('div');
                piece.className = 'piece';
                piece.innerHTML = getPieceSVG(cell);
                square.appendChild(piece);
            }
            boardElement.appendChild(square);
            cellIsWhite = !cellIsWhite;
        });
        cellIsWhite = !cellIsWhite;
    });

    renderBoardAnnotations();
}
