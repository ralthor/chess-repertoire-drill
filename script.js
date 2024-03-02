var globalBoard = null;
var whiteView = true;

document.getElementById('setBoard').addEventListener('click', function() {
    let fen = document.getElementById('fenInput').value;
    setupBoard(fen);
    globalBoard = fen;
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

var clickedSquare = null;
var cellMap = new Map();
var myevent = null;


function boardClick(event, target) {
    // if right click, return
    if (event.which === 3) {
        clickedSquare = null;
        return false;
    }
    myevent = event;
    let square = target;
    let cell = cellMap.get(square.id);
    console.log(cell);
    if (clickedSquare === null) {
        clickedSquare = cell;
    } else {
        let move = {
            from: clickedSquare.rank + clickedSquare.row,
            to: cell.rank + cell.row
        };
        var game = new Chess();
        game.load(globalBoard);
        game.move(move);
        globalBoard = game.fen();
        setupBoard(globalBoard);
    
        clickedSquare = null;
    }
}

class ChessCell {
    constructor(row, rank, piece) {
        this.row = row;
        this.rank = rank;
        this.piece = piece;
        return this;
    }
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
