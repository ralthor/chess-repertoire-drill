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
var moveNumber = 1;
var pgnHistory = [];

document.addEventListener('DOMContentLoaded', function() {
    setupBoard(globalBoard);
    document.getElementById('fenInput').value = globalBoard;
    document.getElementById('pgnText').value = document.getElementById('pgnText').value.trim();
});



document.getElementById('setBoard').addEventListener('click', function() {
    let fen = document.getElementById('fenInput').value;
    setupBoard(fen);
    globalBoard = fen;
});

document.getElementById('loadPgn').addEventListener('click', function() {
    document.getElementById('pgnText').value = document.getElementById('pgnText').value.trim();
    let pgn = document.getElementById('pgnText').value;
    var game = new Chess();
    game.load_pgn(pgn);
    pgnHistory = game.history();
    moveNumber = 0;
    game.load(startingFen);
    globalBoard = game.fen();
    setupBoard(globalBoard);
});

document.getElementById('nextMove').addEventListener('click', function() {
    if (moveNumber >= pgnHistory.length) {
        return;
    }
    var game = new Chess();
    game.load(globalBoard);
    game.move(pgnHistory[moveNumber]);
    globalBoard = game.fen();
    setupBoard(globalBoard);
    moveNumber++;
});

document.getElementById('prevMove').addEventListener('click', function() {
    if (moveNumber <= 0) {
        return;
    }
    moveNumber -= 1;
    var game = new Chess();
    game.load(startingFen);
    for (let i = 0; i < moveNumber; i++) {
        game.move(pgnHistory[i]);
    }
    globalBoard = game.fen();
    setupBoard(globalBoard);
});


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
    e.preventDefault(); // This prevents the default context menu from showing
    clickedSquare = null;
    setupBoard(globalBoard);
});

function getPieceUnicode(piece) {
    const pieces = {
        'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
        'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
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
    boardElement.innerHTML = ''; // Clear the boardElement
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
