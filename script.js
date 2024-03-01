var globalBoard = null;

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



function getPieceUnicode(piece) {
    const pieces = {
        'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
        'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'
    };
    return pieces[piece] || '';
}

function setupBoard(fen) {
    let board = document.getElementById('chessboard');
    board.innerHTML = ''; // Clear the board
    let rows = fen.split(' ')[0].split('/');
    let totalSquares = 0; // Keep track of total squares added to ensure proper coloring

    rows.forEach((row, rowIndex) => {
        let cells = row.split('');
        cells.forEach(cell => {
            if (!isNaN(cell)) { // If the cell is a number, it represents empty squares
                for (let i = 0; i < parseInt(cell); i++) {
                    let square = document.createElement('div');
                    square.className = totalSquares % 2 === 0 ? 'white' : 'black';
                    board.appendChild(square);
                    totalSquares++;
                }
            } else {
                let square = document.createElement('div');
                square.className = totalSquares % 2 === 0 ? 'white' : 'black';
                let piece = document.createElement('span');
                piece.innerHTML = getPieceUnicode(cell);
                piece.style.color = (cell === cell.toUpperCase()) ? 'white' : 'black'; // Upper case for white, lower case for black
                square.appendChild(piece);
                board.appendChild(square);
                totalSquares++;
            }
            if (totalSquares % 8 === 0 && !isNaN(cell)) totalSquares++; // Adjust for new rows
        });
        if (rows.length > 0) totalSquares++; // Adjust at the end of each row to maintain color pattern
    });
}
