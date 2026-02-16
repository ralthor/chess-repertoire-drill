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

document.addEventListener('DOMContentLoaded', function() {
    setupBoard(globalBoard);
    document.getElementById('fenInput').value = globalBoard;
    document.getElementById('pgnText').value = document.getElementById('pgnText').value.trim();
    
    // Initialize moveNavigator
    moveNavigator = new MoveTreeNavigator();
});

document.getElementById('setBoard').addEventListener('click', function() {
    let fen = document.getElementById('fenInput').value;
    setupBoard(fen);
    globalBoard = fen;
});

document.getElementById('loadPgn').addEventListener('click', function() {
    loadPgnFromTextarea();
});

function loadPgnFromTextarea() {
    document.getElementById('pgnText').value = document.getElementById('pgnText').value.trim();
    let pgn = document.getElementById('pgnText').value;
    
    // Parse PGN and build move tree
    moveNavigator.loadPgn(pgn, startingFen);
    
    // Setup renderer with click handler
    renderer = new PgnRenderer(moveNavigator, onPgnMoveClick);
    nodeMap = renderer.buildNodeMap();
    
    // Update board and rendered PGN
    globalBoard = moveNavigator.getCurrentFen();
    setupBoard(globalBoard);
    renderPgnDisplay();
    updateVariationButtons();
}

function onPgnMoveClick(node) {
    moveNavigator.goToNode(node);
    globalBoard = moveNavigator.getCurrentFen();
    setupBoard(globalBoard);
    renderPgnDisplay();
    updateVariationButtons();
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
            currentMove.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            globalBoard = moveNavigator.getCurrentFen();
            setupBoard(globalBoard);
            renderPgnDisplay();
            updateVariationButtons();
        });
        container.appendChild(btn);
    });
}

document.getElementById('nextMove').addEventListener('click', function() {
    if (!moveNavigator || !moveNavigator.canGoNext()) {
        return;
    }
    moveNavigator.next(0); // Main line by default
    globalBoard = moveNavigator.getCurrentFen();
    setupBoard(globalBoard);
    renderPgnDisplay();
    updateVariationButtons();
});

document.getElementById('prevMove').addEventListener('click', function() {
    if (!moveNavigator || !moveNavigator.canGoPrev()) {
        return;
    }
    moveNavigator.prev();
    globalBoard = moveNavigator.getCurrentFen();
    setupBoard(globalBoard);
    renderPgnDisplay();
    updateVariationButtons();
});

// Keyboard navigation
document.addEventListener('keydown', function(e) {
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
                globalBoard = moveNavigator.getCurrentFen();
                setupBoard(globalBoard);
                renderPgnDisplay();
                updateVariationButtons();
            }
            break;
        case 'ArrowLeft':
            e.preventDefault();
            if (moveNavigator.canGoPrev()) {
                moveNavigator.prev();
                globalBoard = moveNavigator.getCurrentFen();
                setupBoard(globalBoard);
                renderPgnDisplay();
                updateVariationButtons();
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
            globalBoard = moveNavigator.getCurrentFen();
            setupBoard(globalBoard);
            renderPgnDisplay();
            updateVariationButtons();
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
        globalBoard = moveNavigator.getCurrentFen();
        setupBoard(globalBoard);
        renderPgnDisplay();
        updateVariationButtons();
    }
}

document.getElementById('move').addEventListener('click', function() {
    let move = document.getElementById('moveInput').value;
    var game = new Chess();
    game.load(globalBoard);
    game.move(move);
    globalBoard = game.fen();
    setupBoard(globalBoard);
});

document.getElementById('flipToggle').addEventListener('change', function() {
    const chessboard = document.getElementById('chessboard');
    if (this.checked) {
        whiteView = false;
    } else {
        whiteView = true;
    }
    setupBoard(globalBoard);
});

document.getElementById('chessboard').addEventListener('contextmenu', function(e) {
    e.preventDefault();
    clickedSquare = null;
    setupBoard(globalBoard);
});

function getPieceUnicode(piece) {
    const pieces = {
        'r': '\u265C', 'n': '\u265E', 'b': '\u265D', 'q': '\u265B', 'k': '\u265A', 'p': '\u265F',
        'R': '\u265C', 'N': '\u265E', 'B': '\u265D', 'Q': '\u265B', 'K': '\u265A', 'P': '\u265F'
    };
    return pieces[piece] || '';
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

function boardClick(event, target) {
    let square = target;
    let cell = cellMap.get(square.id);
    console.log(cell);
    if (clickedSquare === null) {
        clickedSquare = cell;
        square.className = 'selected';
        return;
    }
    let move = {
        from: clickedSquare.rank + clickedSquare.row,
        to: cell.rank + cell.row
    };
    var game = new Chess();
    game.load(globalBoard);
    let moveResult = game.move(move);
    console.log(moveResult);
    if (!moveResult) {
        clickedSquare = null;
        setupBoard(globalBoard);
        return;
    }
    clickedSquare = null;

    globalBoard = game.fen();
    setupBoard(globalBoard);
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
            cellObject = new ChessCell(rowNames[rowIndex], rankNames[cellIndex], cell);
            let square = document.createElement('div');
            id = rankNames[cellIndex] + rowNames[rowIndex];
            square.setAttribute('id', id);
            if (clickedSquare !== null && clickedSquare.rank + clickedSquare.row === cellObject.rank + cellObject.row) {
                square.className = 'selected';
            }
            else 
                square.className = cellIsWhite ? 'white' : 'black';
            cellMap.set(id, cellObject);
            square.addEventListener('click', function(event) {
                boardClick(event, square);
            });
            if (cell !== '.') {
                let piece = document.createElement('span');
                piece.innerHTML = getPieceUnicode(cell);
                piece.style.color = (cell === cell.toUpperCase()) ? 'white' : 'black';
                square.appendChild(piece);
            }
            boardElement.appendChild(square);
            cellIsWhite = !cellIsWhite;
        });
        cellIsWhite = !cellIsWhite;
    });
}
