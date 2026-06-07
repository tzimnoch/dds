// Copyright 2020-2026 Adam Wildavsky
//
//   Use of this source code is governed by an MIT-style
//   license that can be found in the LICENSE file or at
//   https://opensource.org/licenses/MIT

// TODO: Add tests for the exported functions.

// ESLint configuration
// https://eslint.org/demo
//     ECMA Version: 2015
//     Environment: browser

/* eslint-env es6 */
/* exported fillFormWithGrandSlamTestData
            fillFormWithEveryoneMakes3nTestData
            fillFormWithPartScoreTestData
            clearTestData
            rotateClockwise
            pageLoad
            sendJSON
            */

// It's also useful to pass the code through
// https://jshint.com/ and https://jslint.com/

"use strict";

const DIRECTIONS = ["north", "east", "south", "west"];
const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const PIPS = "AKQJT98765432";
const DENOMINATIONS = ["C", "D", "H", "S", "N"];
const DIRECTION_LETTERS = ["N", "E", "S", "W"];

// DDS res_table strain index (S,H,D,C,N) to MVP table column key.
const DENOM_TO_STRAIN = { C: 3, D: 2, H: 1, S: 0, N: 4 };
const DIR_TO_HAND = { N: 0, E: 1, S: 2, W: 3 };

// TODO: Clean up our HTML rendering, perhaps using custom elements.
//       See https://developers.google.com/web/fundamentals/web-components/customelements
const SUIT_SYMBOLS = {
    "S" : "&spades;",
    "H" : "<span style='color: red'>&hearts;</span>",
    "D" : "<span style='color: red'>&diams;</span>",
    "C" : "&clubs;"
};

let ddsModulePromise = null;

function loadDdsModule() {
    if (typeof createDdsModule !== "function") {
        return Promise.reject(new Error(
            "WASM module not found. From the repo root run: ./web/update_wasm.sh"
        ));
    }

    if (!ddsModulePromise) {
        if (typeof ddsMvpWasmBytes !== "function") {
            return Promise.reject(new Error(
                "WASM bytes not found. From the repo root run: ./web/update_wasm.sh"
            ));
        }
        ddsModulePromise = createDdsModule({
            wasmBinary: ddsMvpWasmBytes()
        }).catch((error) => {
            // Allow retry after transient initialization failures.
            ddsModulePromise = null;
            throw error;
        });
    }

    return ddsModulePromise;
}

function handsToPbn(hands) {
    const handOrder = ["N", "E", "S", "W"];
    const suitOrder = ["S", "H", "D", "C"];
    const handStrings = handOrder.map((direction) => {
        return suitOrder.map((suit) => {
            return hands[direction]
                .filter((card) => card.charAt(0) === suit)
                .map((card) => card.charAt(1))
                .sort((a, b) => PIPS.indexOf(a) - PIPS.indexOf(b))
                .join("");
        }).join(".");
    });
    return "N:" + handStrings.join(" ");
}

function fillFormWithTestData(nesw) {
    clear_results();

    var holdings = [];

    for (const hand of nesw) {
        for (const holding of hand.split(".")) {
            holdings.push(holding);
        }
    }

    for (const element of hand_elements()) {
        element.value = holdings.shift();
    }
}

function fillFormWithGrandSlamTestData() {
    fillFormWithTestData([
        "AKQJ.AKQJ.T98.T9",
        "5432.5432.32.432",
        "T98.T9.AKQJ.AKQJ",
        "76.876.7654.8765"
    ]);
}

function fillFormWithEveryoneMakes3nTestData() {
    fillFormWithTestData([
        "QT9.A8765432.KJ.",
        "KJ..A8765432.QT9",
        "A8765432.QT9..KJ",
        ".KJ.QT9.A8765432"
    ]);
}

function fillFormWithPartScoreTestData() {
    fillFormWithTestData([
        "AQ85.AK976.5.J87",
        "JT.QJ5432.Q9.KQ9",
        "972..JT863.A6432",
        "K643.T8.AK742.T5"
    ]);
}

function * directions_and_suits() {
    // Generator

    for (const direction of DIRECTIONS) {
        for (const suit of SUITS) {
            yield { "direction": direction, "suit": suit };
        }
    }
}

function * hand_elements() {
    // Generator

    for (const ds of directions_and_suits()) {
        var element_index = ds.direction + "_" + ds.suit;
        var element = document.getElementById(element_index);
        yield element;
    }
}

function clearTestData() {
    clear_results();

    for (const element of hand_elements()) {
        element.value = "";
    }
}

function rotateClockwise() {
    clear_results();

    var hands = [];

    for (const element of hand_elements()) {
        hands.push(element.value);
    }

    // rotate west to north, and so on
    for (var i = 0; i < 4; i++) {
        var west = hands.pop();
        hands.unshift(west);
    }

    for (const element of hand_elements()) {
        element.value = hands.shift();
    }
}

function collectHands() {
    var hands = {};

    for (const ds of directions_and_suits()) {
        var direction_letter = ds.direction.charAt(0).toUpperCase();

        hands[direction_letter] = hands[direction_letter] || [];

        var suit_letter = ds.suit.charAt(0).toUpperCase();
        var element_index = ds.direction + "_" + ds.suit;
        var holding = document.getElementById(element_index).value;

        for (const card of holding) {
            hands[direction_letter].push(suit_letter + card.toUpperCase());
        }
    }

    return hands;
}

function inputIsValid(hands) {
    const deck = {};
    const duplicates = [];

    for (const direction of Object.keys(hands)) {
        const hand = hands[direction];

        if (hand.length != 13) {
            return "Please enter 13 cards per hand.";
        }

        for (const card of hand) {
            const pip = card.substring(1);

            if (!PIPS.includes(pip)) {
                return "Please use only these pips: " + PIPS;
            }

            if (deck[card]) {
                if (deck[card] == 1) {
                    duplicates.push(card);
                }

                deck[card]++;
            } else {
                deck[card] = 1;
            }
        }
    }

    if (duplicates.length) {
        var error_message = "Duplicated card";

        if (duplicates.length > 1) {
            error_message += "s";
        }

        error_message += ": ";

        for (const card of duplicates) {
            const suit_letter = card.substring(0, 1);
            const pip = card.substring(1);
            const suit_symbol = SUIT_SYMBOLS[suit_letter];

            error_message += suit_symbol;
            error_message += pip;
            error_message += " ";
        }

        return error_message;
    }

    return "";
}

function pageLoad() {
    document.getElementById("valid-pips").innerHTML = PIPS;
}

function clear_results() {
    var result = document.getElementById("result");
    var result_table = document.getElementById("result-table");

    result.innerHTML = "";

    for (var row = 1; row <= 4; row++) {
        for (var column = 1; column <= 5; column++) {
            var cell = result_table.rows[row].cells[column];
            cell.innerHTML = "";
        }
    }
}

async function sendJSON() {
    const result = document.getElementById("result");
    const result_table = document.getElementById("result-table");

    var hands = collectHands();

    const error_message = inputIsValid(hands);

    if (error_message.length) {
        clear_results();
        result.innerHTML = error_message;
        return;
    }

    clear_results();
    result.innerHTML = "Computing&hellip;"; // horizontal ellipsis

    try {
        const module = await loadDdsModule();
        const pbn = handsToPbn(hands);
        const outPtr = module._malloc(20 * 4);

        try {
            const rc = module.ccall(
                "dds_mvp_calc_table",
                "number",
                ["string", "number"],
                [pbn, outPtr]
            );

            if (rc !== 1) {
                result.innerHTML = "DDS error (code " + rc + ").";
                return;
            }

            for (var row = 1; row <= 4; row++) {
                for (var column = 1; column <= 5; column++) {
                    const cell = result_table.rows[row].cells[column];
                    const denomination = DENOMINATIONS[column - 1];
                    const direction = DIRECTION_LETTERS[row - 1];
                    const strain = DENOM_TO_STRAIN[denomination];
                    const hand = DIR_TO_HAND[direction];
                    const index = strain * 4 + hand;
                    cell.innerHTML = module.getValue(
                        outPtr + index * 4,
                        "i32"
                    );
                }
            }

            result.innerHTML = "";
        } finally {
            module._free(outPtr);
        }
    } catch (err) {
        clear_results();
        result.innerHTML = err instanceof Error
            ? err.message
            : err == null
                ? "Unknown error"
                : String(err);
    }
}

function generateRandomDeal() {
    const suits = ['S', 'H', 'D', 'C'];
    const pips = 'AKQJT98765432';
    const deck = [];

    for (const suit of suits) {
        for (const pip of pips) {
            deck.push(suit + pip);
        }
    }

    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const hands = { N: [], E: [], S: [], W: [] };
    const dirs = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 52; i++) {
        hands[dirs[Math.floor(i / 13)]].push(deck[i]);
    }

    return hands;
}

function writeDealBinary(dds, hands) {
    const dealPtr = dds._malloc(64);
    const setMem = (ptr, val) => dds.setValue
        ? dds.setValue(ptr, val, 'i32')
        : (dds.HEAPU32 || dds.HEAP32)[ptr >> 2] = val;
    const dirs = ['N', 'E', 'S', 'W'];
    const suitOrder = ['S', 'H', 'D', 'C'];
    for (let h = 0; h < 4; h++) {
        for (let s = 0; s < 4; s++) {
            const byteOffset = (h * 4 + s) * 4;
            let mask = 0;
            for (const card of hands[dirs[h]]) {
                if (card.charAt(0) === suitOrder[s]) {
                    const bit = 14 - PIPS.indexOf(card.charAt(1));
                    mask |= (1 << bit);
                }
            }
            setMem(dealPtr + byteOffset, mask);
        }
    }
    return dealPtr;
}

function readDdTableBinary(dds, resultsPtr) {
    const getMem = (ptr) => dds.getValue
        ? dds.getValue(ptr, 'i32')
        : (dds.HEAPU32 || dds.HEAP32)[ptr >> 2];
    const table = [];
    for (let i = 0; i < 20; i++) {
        table.push(getMem(resultsPtr + i * 4));
    }
    return table;
}

async function sendJSONLegacy() {
    const result = document.getElementById('result');
    const result_table = document.getElementById('result-table');

    var hands = collectHands();

    const error_message = inputIsValid(hands);

    if (error_message.length) {
        clear_results();
        result.innerHTML = error_message;
        return;
    }

    clear_results();
    result.innerHTML = 'Computing&hellip;';

    try {
        if (typeof DDS !== 'function') {
            result.innerHTML = 'Legacy DDS module not loaded.';
            return;
        }

        const dds = await DDS({ locateFile: (path) => path === 'dds.wasm' ? 'dds-2.9.0.wasm' : path });
        dds._SetMaxThreads(1);

        const dealPtr = dds._malloc(64);
        const resultsPtr = dds._malloc(80);

        const setMem = (ptr, val) => dds.setValue
            ? dds.setValue(ptr, val, 'i32')
            : (dds.HEAPU32 || dds.HEAP32)[ptr >> 2] = val;
        const getMem = (ptr) => dds.getValue
            ? dds.getValue(ptr, 'i32')
            : (dds.HEAPU32 || dds.HEAP32)[ptr >> 2];

        const dirs = ['N', 'E', 'S', 'W'];
        const suitOrder = ['S', 'H', 'D', 'C'];
        for (let h = 0; h < 4; h++) {
            for (let s = 0; s < 4; s++) {
                const byteOffset = (h * 4 + s) * 4;
                let mask = 0;
                for (const card of hands[dirs[h]]) {
                    if (card.charAt(0) === suitOrder[s]) {
                        const bit = 14 - PIPS.indexOf(card.charAt(1));
                        mask |= (1 << bit);
                    }
                }
                setMem(dealPtr + byteOffset, mask);
            }
        }

        try {
            const rc = dds._CalcDDtable(dealPtr, resultsPtr);

            console.log('CalcDDtable rc:', rc);

            if (rc !== 1) {
                result.innerHTML = 'DDS error (code ' + rc + ').';
                return;
            }

            for (var row = 1; row <= 4; row++) {
                for (var column = 1; column <= 5; column++) {
                    const cell = result_table.rows[row].cells[column];
                    const strain = DENOM_TO_STRAIN[DENOMINATIONS[column - 1]];
                    const hand = DIR_TO_HAND[DIRECTION_LETTERS[row - 1]];
                    const value = getMem(resultsPtr + (strain * 4 + hand) * 4);
                    cell.innerHTML = value;
                }
            }

            result.innerHTML = '';
        } finally {
            dds._free(dealPtr);
            dds._free(resultsPtr);
        }
    } catch (err) {
        clear_results();
        result.innerHTML = err instanceof Error
            ? err.message
            : err == null
                ? 'Unknown error'
                : String(err);
    }
}

function runSpeedTest() {
    const numDeals = 100;
    const batchSize = 10;

    console.log('Starting speed test: ' + numDeals + ' random deals in batches of ' + batchSize);

    (async () => {
        try {
            const module = await loadDdsModule();

            const allHands = [];
            for (let i = 0; i < numDeals; i++) {
                allHands.push(generateRandomDeal());
            }

            const totalStart = performance.now();

            for (let batch = 0; batch < numDeals / batchSize; batch++) {
                const batchStart = performance.now();

                for (let i = 0; i < batchSize; i++) {
                    const hands = allHands[batch * batchSize + i];
                    const pbn = handsToPbn(hands);
                    const outPtr = module._malloc(20 * 4);

                    const rc = module.ccall(
                        'dds_mvp_calc_table',
                        'number',
                        ['string', 'number'],
                        [pbn, outPtr]
                    );

                    module._free(outPtr);

                    if (rc !== 1) {
                        console.error('DDS error (code ' + rc + ') on deal ' + (batch * batchSize + i));
                    }
                }

                const batchEnd = performance.now();
                const batchTime = batchEnd - batchStart;
                console.log('Batch ' + (batch + 1) + ': ' + batchTime.toFixed(1) + 'ms (' + (batchTime / batchSize).toFixed(2) + 'ms per deal)');
            }

            const totalEnd = performance.now();
            const totalTime = totalEnd - totalStart;
            console.log('Total: ' + totalTime.toFixed(1) + 'ms (' + (totalTime / numDeals).toFixed(2) + 'ms per deal)');

            const lastHands = allHands[numDeals - 1];
            const result = document.getElementById('result');
            const result_table = document.getElementById('result-table');

            const handHoldings = ['N', 'E', 'S', 'W'].map(dir => {
                const suits = lastHands[dir];
                const bySuit = { S: [], H: [], D: [], C: [] };
                for (const card of suits) {
                    bySuit[card.charAt(0)].push(card.charAt(1));
                }
                return ['S', 'H', 'D', 'C'].map(s => bySuit[s].sort((a, b) => PIPS.indexOf(a) - PIPS.indexOf(b)).join('')).join('.');
            });
            clear_results();
            fillFormWithTestData(handHoldings);

            const lastPbn = handsToPbn(lastHands);
            console.log('Last deal PBN: ' + lastPbn);
            console.log('Last deal hands:', handHoldings.join(' '));

            const outPtr = module._malloc(20 * 4);
            const rc = module.ccall(
                'dds_mvp_calc_table',
                'number',
                ['string', 'number'],
                [lastPbn, outPtr]
            );

            result.innerHTML = 'Speed test: ' + totalTime.toFixed(1) + 'ms total, ' + (totalTime / numDeals).toFixed(2) + 'ms avg per deal';

            if (rc === 1) {
                for (var row = 1; row <= 4; row++) {
                    for (var column = 1; column <= 5; column++) {
                        const cell = result_table.rows[row].cells[column];
                        const denomination = DENOMINATIONS[column - 1];
                        const direction = DIRECTION_LETTERS[row - 1];
                        const strain = DENOM_TO_STRAIN[denomination];
                        const hand = DIR_TO_HAND[direction];
                        const index = strain * 4 + hand;
                        cell.innerHTML = module.getValue(outPtr + index * 4, 'i32');
                    }
                }
                console.log('Last deal DD table displayed in table');
            } else {
                result.innerHTML = 'DDS error (code ' + rc + ').';
            }
            module._free(outPtr);
        } catch (err) {
            console.error('Speed test error:', err);
        }
    })();
}

function runSpeedTestLegacy() {
    const numDeals = 100;
    const batchSize = 10;

    console.log('Starting legacy speed test: ' + numDeals + ' random deals in batches of ' + batchSize);

    (async () => {
        try {
            if (typeof DDS !== 'function') {
                console.error('Legacy DDS module not found. Ensure dds-2.9.0.js is loaded.');
                return;
            }

            const dds = await DDS({ locateFile: (path) => path === 'dds.wasm' ? 'dds-2.9.0.wasm' : path });
            dds._SetMaxThreads(1);

            const allHands = [];
            for (let i = 0; i < numDeals; i++) {
                allHands.push(generateRandomDeal());
            }

            const totalStart = performance.now();

            for (let batch = 0; batch < numDeals / batchSize; batch++) {
                const batchStart = performance.now();

                for (let i = 0; i < batchSize; i++) {
                    const hands = allHands[batch * batchSize + i];
                    const dealPtr = writeDealBinary(dds, hands);
                    const resultsPtr = dds._malloc(80);

                    const rc = dds._CalcDDtable(dealPtr, resultsPtr);
                    dds._free(dealPtr);
                    dds._free(resultsPtr);

                    if (rc !== 1) {
                        console.error('DDS error (code ' + rc + ') on deal ' + (batch * batchSize + i));
                    }
                }

                const batchEnd = performance.now();
                const batchTime = batchEnd - batchStart;
                console.log('Batch ' + (batch + 1) + ': ' + batchTime.toFixed(1) + 'ms (' + (batchTime / batchSize).toFixed(2) + 'ms per deal)');
            }

            const totalEnd = performance.now();
            const totalTime = totalEnd - totalStart;
            console.log('Total: ' + totalTime.toFixed(1) + 'ms (' + (totalTime / numDeals).toFixed(2) + 'ms per deal)');

            const lastHands = allHands[numDeals - 1];
            const result = document.getElementById('result');
            const result_table = document.getElementById('result-table');

            const handHoldings = ['N', 'E', 'S', 'W'].map(dir => {
                const suits = lastHands[dir];
                const bySuit = { S: [], H: [], D: [], C: [] };
                for (const card of suits) {
                    bySuit[card.charAt(0)].push(card.charAt(1));
                }
                return ['S', 'H', 'D', 'C'].map(s => bySuit[s].sort((a, b) => PIPS.indexOf(a) - PIPS.indexOf(b)).join('')).join('.');
            });
            clear_results();
            fillFormWithTestData(handHoldings);

            console.log('Last deal hands:', handHoldings.join(' '));

            const dealPtr = writeDealBinary(dds, lastHands);
            const resultsPtr = dds._malloc(80);

            const rc = dds._CalcDDtable(dealPtr, resultsPtr);

            result.innerHTML = 'Legacy speed test: ' + totalTime.toFixed(1) + 'ms total, ' + (totalTime / numDeals).toFixed(2) + 'ms avg per deal';

            if (rc === 1) {
                for (var row = 1; row <= 4; row++) {
                    for (var column = 1; column <= 5; column++) {
                        const cell = result_table.rows[row].cells[column];
                        const strain = DENOM_TO_STRAIN[DENOMINATIONS[column - 1]];
                        const hand = DIR_TO_HAND[DIRECTION_LETTERS[row - 1]];
                        const value = (dds.HEAPU32 || dds.HEAP32)[resultsPtr + (strain * 4 + hand) * 4 >> 2];
                        cell.innerHTML = value;
                    }
                }
                console.log('Last deal DD table displayed in table');
            }
            dds._free(dealPtr);
            dds._free(resultsPtr);
        } catch (err) {
            console.error('Legacy speed test error:', err);
        }
    })();
}

function runParallelSpeedTest() {
    const numDeals = 100;
    const batchSize = 10;

    console.log('Starting parallel speed test: ' + numDeals + ' deals, both solvers');

    (async () => {
        try {
            const module = await loadDdsModule();
            const dds = await DDS({ locateFile: (path) => path === 'dds.wasm' ? 'dds-2.9.0.wasm' : path });
            dds._SetMaxThreads(1);

            const allHands = [];
            for (let i = 0; i < numDeals; i++) {
                allHands.push(generateRandomDeal());
            }

            const result = document.getElementById('result');
            let totalNewMs = 0;
            let totalLegacyMs = 0;
            let totalDealCount = 0;
            const inconsistencies = [];

            for (let batch = 0; batch < numDeals / batchSize; batch++) {
                const batchStart = performance.now();
                let batchNewMs = 0;
                let batchLegacyMs = 0;

                for (let i = 0; i < batchSize; i++) {
                    const hands = allHands[batch * batchSize + i];
                    const dealIndex = batch * batchSize + i;

                    // Time new solver
                    const t1 = performance.now();
                    const pbn = handsToPbn(hands);
                    const outPtr = module._malloc(20 * 4);
                    const rcNew = module.ccall('dds_mvp_calc_table', 'number', ['string', 'number'], [pbn, outPtr]);
                    const tableNew = rcNew === 1 ? (() => { const t = []; for (let j = 0; j < 20; j++) t.push(module.getValue(outPtr + j * 4, 'i32')); return t; })() : null;
                    module._free(outPtr);
                    const t1end = performance.now();
                    batchNewMs += t1end - t1;

                    // Time legacy solver
                    const t2 = performance.now();
                    const dealPtr = writeDealBinary(dds, hands);
                    const resultsPtr = dds._malloc(80);
                    const rcLegacy = dds._CalcDDtable(dealPtr, resultsPtr);
                    const tableLegacy = rcLegacy === 1 ? readDdTableBinary(dds, resultsPtr) : null;
                    dds._free(dealPtr);
                    dds._free(resultsPtr);
                    const t2end = performance.now();
                    batchLegacyMs += t2end - t2;

                    // Compare results
                    if (tableNew && tableLegacy) {
                        for (let j = 0; j < 20; j++) {
                            if (tableNew[j] !== tableLegacy[j]) {
                                inconsistencies.push({
                                    deal: dealIndex,
                                    index: j,
                                    newSolver: tableNew[j],
                                    legacy: tableLegacy[j]
                                });
                            }
                        }
                    }
                    totalDealCount++;
                }

                const batchEnd = performance.now();
                const batchTime = batchEnd - batchStart;
                const avgNewMs = batchNewMs / batchSize;
                const avgLegacyMs = batchLegacyMs / batchSize;
                totalNewMs += batchNewMs;
                totalLegacyMs += batchLegacyMs;
                console.log('Batch ' + (batch + 1) + ': ' + batchTime.toFixed(1) + 'ms (' + (batchTime / batchSize).toFixed(2) + 'ms/ea) | New: ' + avgNewMs.toFixed(2) + 'ms/ea, Legacy: ' + avgLegacyMs.toFixed(2) + 'ms/ea');
            }

            const lastHands = allHands[numDeals - 1];
            const result_table = document.getElementById('result-table');

            const handHoldings = ['N', 'E', 'S', 'W'].map(dir => {
                const suits = lastHands[dir];
                const bySuit = { S: [], H: [], D: [], C: [] };
                for (const card of suits) {
                    bySuit[card.charAt(0)].push(card.charAt(1));
                }
                return ['S', 'H', 'D', 'C'].map(s => bySuit[s].sort((a, b) => PIPS.indexOf(a) - PIPS.indexOf(b)).join('')).join('.');
            });
            clear_results();
            fillFormWithTestData(handHoldings);

            let output = 'New solver: ' + totalNewMs.toFixed(1) + 'ms (' + (totalNewMs / numDeals).toFixed(2) + 'ms avg). ' +
                         'Legacy: ' + totalLegacyMs.toFixed(1) + 'ms (' + (totalLegacyMs / numDeals).toFixed(2) + 'ms avg). ';
            output += inconsistencies.length === 0
                ? 'There are 0 discrepancies between the two solvers\' results.'
                : inconsistencies.length + ' discrepancies between the two solvers\' results.';
            result.innerHTML = output;
            console.log(output);

            // Display last hand with new solver
            const pbn = handsToPbn(lastHands);
            const outPtr = module._malloc(20 * 4);
            module.ccall('dds_mvp_calc_table', 'number', ['string', 'number'], [pbn, outPtr]);

            for (var row = 1; row <= 4; row++) {
                for (var column = 1; column <= 5; column++) {
                    const cell = result_table.rows[row].cells[column];
                    const index = DENOM_TO_STRAIN[DENOMINATIONS[column - 1]] * 4 + DIR_TO_HAND[DIRECTION_LETTERS[row - 1]];
                    const val = module.getValue(outPtr + index * 4, 'i32');
                    cell.innerHTML = val;
                }
            }
            module._free(outPtr);
            console.log('DD table displayed in table');
        } catch (err) {
            console.error('Parallel speed test error:', err);
        }
    })();
}
