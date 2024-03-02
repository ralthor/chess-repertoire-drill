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

function setupBoard(fen) {
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
        // reverse each row in the board
        board.forEach((row, rowIndex) => {
            board[rowIndex] = row.split('').reverse().join('');
        });
    }
    console.log(board);
    
    board.forEach((row, rowIndex) => {
        let cells = row.split('');
        cells.forEach(cell => {
                let square = document.createElement('div');
                square.className = cellIsWhite ? 'white' : 'black';
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
