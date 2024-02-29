document.getElementById('setBoard').addEventListener('click', function() {
    let fen = document.getElementById('fenInput').value;
    setupBoard(fen);
});

function getPieceUnicode(piece) {
    const pieces = {
        'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
        'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
    };
    return pieces[piece] || '';
}

function setupBoard(fen) {
    let board = document.getElementById('chessboard');
    board.innerHTML = ''; // Clear the board
    let rows = fen.split(' ')[0].split('/');
    rows.forEach((row, rowIndex) => {
        console.log(row, rowIndex);
        let cellCount = 0;
        for (let i = 0; i < row.length; i++) {
            let square = document.createElement('div');
            square.className = (rowIndex + cellCount) % 2 === 0 ? 'white' : 'black';
            console.log(rowIndex, cellCount, square.className, row[i]);
            let char = row[i];
            if (!isNaN(char)) { // Empty squares
                for (let j = 0; j < parseInt(char); j++) {
                    let emptySquare = square.cloneNode(true);
                    board.appendChild(emptySquare);
                    cellCount++;
                }
            } else { // Chess piece
                let piece = document.createElement('span');
                piece.innerHTML = getPieceUnicode(char);
                square.appendChild(piece);
                board.appendChild(square);
                cellCount++;
            }
        }
    });
}
