const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    PgnParser,
    parseVendorTagsFromComment
} = require('../logic.js');

function normalizePgnWhitespace(pgn) {
    return String(pgn || '').replace(/\s+/g, ' ').trim();
}

function readFixture(filename) {
    return fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8');
}

test('parses comment text, cal/csl tags, NAGs, and variations', () => {
    const parser = new PgnParser();
    const pgn = readFixture('annotations-roundtrip.pgn');
    const doc = parser.parseDocument(pgn);

    const root = doc.root;
    const e4 = root.children[0];
    assert.ok(e4, 'expected first move node');

    assert.deepEqual(e4.nags, [1]);
    assert.equal(e4.commentsAfter.length, 1);
    assert.equal(e4.commentsAfter[0].text, 'Main line with text');
    assert.deepEqual(e4.commentsAfter[0].tags.cal, [
        { color: 'G', from: 'g1', to: 'f3' },
        { color: 'R', from: 'd1', to: 'd7' }
    ]);
    assert.deepEqual(e4.commentsAfter[0].tags.csl, [
        { color: 'G', square: 'e4' },
        { color: 'R', square: 'e5' }
    ]);

    const c5 = e4.children[0];
    const nf3 = c5.children[0];
    assert.ok(nf3, 'expected Nf3 node');
    assert.equal(nf3.commentsAfter.length, 1);
    assert.equal(nf3.commentsAfter[0].text, 'Natural move');
    assert.deepEqual(nf3.commentsAfter[0].tags.cal, [
        { color: 'B', from: 'g1', to: 'f3' }
    ]);

    assert.equal(nf3.children.length, 2, 'expected mainline + variation from Nf3');
    const nc6Variation = nf3.children[1];
    assert.equal(nc6Variation.move, 'Nc6');
    assert.deepEqual(nc6Variation.nags, [5]);
    assert.equal(nc6Variation.commentsAfter[0].text, 'Alt');
    assert.deepEqual(nc6Variation.commentsAfter[0].tags.csl, [
        { color: 'B', square: 'c6' },
        { color: 'Y', square: 'd4' }
    ]);
});

test('parse then serialize is round-trip stable for unchanged documents', () => {
    const parser = new PgnParser();
    const pgn = readFixture('annotations-roundtrip.pgn');
    const doc = parser.parseDocument(pgn);

    const serialized = parser.serialize(doc);
    assert.equal(normalizePgnWhitespace(serialized), normalizePgnWhitespace(pgn));
});

test('dirty documents serialize canonically while preserving annotations and structure', () => {
    const parser = new PgnParser();
    const pgn = readFixture('annotations-roundtrip.pgn');
    const doc = parser.parseDocument(pgn);
    doc.isDirty = true;

    const serialized = parser.serialize(doc);
    assert.match(serialized, /\[Event "Round Trip"\]/);
    assert.match(serialized, /\[Result "1-0"\]/);
    assert.match(serialized, /\$1/);
    assert.match(serialized, /\(%?2\.\.\. Nc6/);
    assert.match(serialized, /%\s*cal\s+Gg1f3,Rd1d7/i);
    assert.match(serialized, /%\s*csl\s+Ge4,Re5/i);
    assert.match(serialized, /1-0\s*$/);
});

test('vendor tag parser ignores invalid items and keeps valid ones', () => {
    const parsed = parseVendorTagsFromComment('Idea [%cal Ze2e4,Ga2a4] [%csl Rz9,Ye4]');

    assert.equal(parsed.text, 'Idea');
    assert.deepEqual(parsed.tags.cal, [
        { color: 'G', from: 'a2', to: 'a4' }
    ]);
    assert.deepEqual(parsed.tags.csl, [
        { color: 'Y', square: 'e4' }
    ]);
});
