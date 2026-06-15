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
             sendJSONBinary
             runSpeedTest
             runParallelSpeedTest
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

// Binary format helpers for direct DDS API access
const SUIT_ORDER = ["S", "H", "D", "C"];
const HAND_ORDER = ["N", "E", "S", "W"];

let ddsModulePromise = null;

function loadDdsModule() {
    if (typeof createDdsModule !== "function") {
        return Promise.reject(new Error(
            "WASM module not found. From the repo root run: ./web/update_wasm.sh"
        ));
    }

    if (!ddsModulePromise) {
        const wasmBinary = typeof ddsWasmBytes === "function" 
            ? ddsWasmBytes() 
            : null;
        ddsModulePromise = createDdsModule({ wasmBinary }).catch((error) => {
            ddsModulePromise = null;
            throw error;
        });
    }

    return ddsModulePromise;
}

// Convert PBN hands array to DDS binary format (16 uint32: one per hand/suit)
function handsToBinary(hands) {
    const deal = new Uint32Array(16); // 4 hands x 4 suits
    
    for (const hand of HAND_ORDER) {
        const handIdx = HAND_ORDER.indexOf(hand);
        for (const suit of SUIT_ORDER) {
            const suitIdx = SUIT_ORDER.indexOf(suit);
            const cards = hands[hand] || [];
            let bits = 0;
            for (const card of cards) {
                if (card.charAt(0) === suit) {
                    const pip = card.charAt(1);
                    const pipIdx = PIPS.indexOf(pip);
                    // In DDS binary format: bit 14 for Ace, bit 2 for 2
                    bits |= (1 << (14 - pipIdx));
                }
            }
            deal[handIdx * 4 + suitIdx] = bits;
        }
    }
    return deal;
}

// Call CalcDDtable directly with binary format deal
async function sendJSONBinary() {
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
    result.innerHTML = "Computing&hellip;";

    try {
        const module = await loadDdsModule();
        const deal = handsToBinary(hands);
        const dealPtr = module._malloc(16 * 4);
        const outPtr = module._malloc(20 * 4);

        try {
            // Write deal to WASM memory
            module.HEAP32.set(deal, dealPtr >> 2);

            // Call CalcDDtable with binary format
            const rc = module.ccall(
                "CalcDDtable",
                "number",
                ["number", "number"],
                [dealPtr, outPtr]
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
                    cell.innerHTML = module.getValue(outPtr + index * 4, "i32");
                }
            }

            result.innerHTML = "";
        } finally {
            module._free(dealPtr);
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

// Generate a random deal
function generateRandomDeal() {
    const deck = [];
    for (const suit of SUIT_ORDER) {
        for (let i = 0; i < 13; i++) {
            deck.push(suit + PIPS[i]);
        }
    }
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Distribute to hands
    const hands = { N: [], E: [], S: [], W: [] };
    for (let i = 0; i < 52; i++) {
        const hand = HAND_ORDER[i % 4];
        hands[hand].push(deck[i]);
    }
    return hands;
}

// Speed test: run 100 deals in groups of 10
async function runSpeedTest() {
    const result = document.getElementById("result");
    result.innerHTML = "Running speed test...";

    try {
        const module = await loadDdsModule();
        const dealPtr = module._malloc(16 * 4);
        const outPtr = module._malloc(20 * 4);

        try {
            const deals = [];
            for (let i = 0; i < 100; i++) {
                deals.push(generateRandomDeal());
            }

            const start = performance.now();
            for (const hands of deals) {
                const deal = handsToBinary(hands);
                module.HEAP32.set(deal, dealPtr >> 2);
                const rc = module.ccall("CalcDDtable", "number", 
                    ["number", "number"], [dealPtr, outPtr]);
                if (rc !== 1) throw new Error("DDS error " + rc);
            }
            const elapsed = performance.now() - start;

            // Show last deal and result
            const lastPbn = handsToPbn(deals[99]);
            const lastResult = [];
            for (let i = 0; i < 20; i++) {
                lastResult.push(module.getValue(outPtr + i * 4, "i32"));
            }

            result.innerHTML = `100 deals in ${elapsed.toFixed(1)}ms (avg ${(elapsed/100).toFixed(1)}ms/deal)<br/>
                Last PBN: ${lastPbn}<br/>
                Last result: [${lastResult.join(", ")}]`;
        } finally {
            module._free(dealPtr);
            module._free(outPtr);
        }
    } catch (err) {
        result.innerHTML = err instanceof Error ? err.message : String(err);
    }
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
