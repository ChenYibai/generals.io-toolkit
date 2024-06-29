// ==UserScript==
// @name               generals.io toolkit
// @namespace          http://tampermonkey.net/
// @version            1.4
// @description        Helps with your battles in generals.io
// @author             ntfw2
// @match              https://generals.io/*
// @run-at             document-start
// @icon               https://www.google.com/s2/favicons?sz=64&domain=generals.io
// ==/UserScript==

const isReplay = (window.location.href.indexOf("replays") != -1);
let blockUserInput = false; // When the program is annihilating the enemy, it will block all user input.

function pageReadyCallback () {
    // Light up the background
    document.styleSheets[0].insertRule(`#gameMap td.fog {background-color: rgba(255,255,255,0.5) !important;}`,0);
    if(!isReplay) {
        document.styleSheets[0].insertRule(`#delta-cities-span:after {content:"--"}`);
        document.styleSheets[0].insertRule(`#delta-cities-div {display:none}`);
        let element = document.createElement("div");
        element.id = "delta-cities-div";
        element.style.position = "fixed";
        element.style.top = "35px";
        element.style.left = "-10px";
        element.style.zIndex = "25";
        element.style.padding = "5px 16px";
        element.className = "background";
        element.innerHTML = `Δ<img src="/city.png" style="width:1em">: <span id="delta-cities-span"></span>`;
        document.body.appendChild(element);
    }
    window.addEventListener("keydown", function (e) {
        if(e.keyCode == 220) { // Press key "\" to clear all marks
            mapMarkData = [];
            removeCSSRule(`#gameMap > tbody > tr:nth-child(`, true);
        }
    });
    for(let eventName of ["mousedown", "mousemove", "mouseup", "keydown", "keyup"]) {
        window.addEventListener(eventName, function (e) {
            if(blockUserInput && e.isTrusted) e.stopImmediatePropagation();
        }, true);
    }
}

let checkready = setInterval(() => {
	if (document.readyState === "complete"){
		pageReadyCallback();
		clearInterval(checkready);
	}
}, 250);

let mapMarkData = [];
const MARK_NONE = undefined,
      MARK_MOUNTAIN = 0,
      MARK_CITY = 1,
      MARK_GENERAL = 2;

const colorClasses = ['red', 'green', 'lightblue', 'purple', 'teal', 'blue', 'orange', 'maroon', 'yellow', 'pink', 'brown', 'lightgreen', 'purpleblue'];
let prevState = {
    turn: undefined, // Caution: 'turn' is multiplied by 2
    ownArmy: undefined,
    enemyArmy: undefined
};

function removeCSSRule(str, all) { // remove (all) CSS rule(s) containing `str`
    for(let i = 0; i < document.styleSheets[0].cssRules.length; i++) {
        let rule = document.styleSheets[0].cssRules[i];
        if(rule.cssText.indexOf(str) != -1) {
            document.styleSheets[0].deleteRule(i);
            if(!all) break;
            i--;
        }
    }
}

let checkGameStart = setInterval(() => {
    if(!!document.getElementById('gameMap') && !document.querySelector(".alert.center > center > h1")) {
        gameStartCallback();
        clearInterval(checkGameStart);
    }
}, 500);
let checkGameOver = -1;
let tickIntervalID = -1;

let annihilateCooldown = 0;

function gameStartCallback() {
    checkGameOver = setInterval(() => {
        if(!document.getElementById('gameMap') || !!document.querySelector(".alert.center > center > h1")) {
            gameOverCallback();
            clearInterval(checkGameOver);
        }
    }, 500);
    console.debug(`Game starts.`);

    // Initialize map mark data
    let gameMap = document.getElementById('gameMap');
    mapMarkData = [];
    console.debug(`Map mark data initialized.`);
    removeCSSRule(`#gameMap > tbody > tr:nth-child(`, true);

    // Initialize leaderboard & city statistics
    let leaderBoard = document.querySelector("#game-leaderboard > tbody");
    prevState = {
        turn: undefined,
        ownArmy: undefined,
        enemyArmy: undefined
    };
    function findColorClass(classNames) {
        for(let className of classNames.split(" ")) {
            if(colorClasses.includes(className)) {
                return className;
            }
        }
    }
    if(!isReplay) {
        removeCSSRule(`delta-cities-span`, false);
        document.styleSheets[0].insertRule(`#delta-cities-span:after {content:"--"}`);
        removeCSSRule(`delta-cities-div`, false);
    }

    annihilateCooldown = 0;

    // Launch
    tickIntervalID = setInterval(tick, 100);

    function getRowIndex(cell) { // 1-based
        return Array.prototype.indexOf.call(cell.parentNode.parentNode.children, cell.parentNode) + 1;
    }
    function getColumnIndex(cell) { // 1-based
        return Array.prototype.indexOf.call(cell.parentNode.children, cell) + 1;
    }
    function div(a, b) {
        return Math.floor(a / b);
    }
    function signedNum(x) {
        return (x > 0 ? `+${x}` : `${x}`);
    }
    function isValid(x) {
        return (!!x || x === 0 || x === "");
    }
    function isValidState(state) {
        return (isValid(state.turn) && isValid(state.ownArmy) && isValid(state.enemyArmy));
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function parseArmyNum(str) { // Convert a string into a number
        let trimmed = "";
        for(let char of str) {
            if("0123456789".indexOf(char) != -1) trimmed += char;
            else break;
        }
        return Number(trimmed);
    }

    async function tick() {
        // Mark visited mountains, cities and generals
        // ======================
        if(Number(document.getElementById('turn-counter').innerText.split(" ")[1]) >= 4) { // Start from Turn 4
            let cells = gameMap.querySelectorAll('td');
            for (let i = 0; i < cells.length; i++) {
                let cell = cells[i];
                let className = cell.className;
                let classes = [];
                if(className) classes = className.split(' ');

                if (!classes.includes('fog')) {
                    let markType = MARK_NONE;
                    if (classes.includes('city')) markType = MARK_CITY;
                    if (classes.includes('general')) markType = MARK_GENERAL;
                    if (classes.includes('mountain')) markType = MARK_MOUNTAIN;
                    if(markType != mapMarkData[i]) {
                        console.debug(`Marked: at = ${i}, orig = ${mapMarkData[i]}, new = ${markType}.`);
                        mapMarkData[i] = markType;
                        let cssSelector = `#gameMap > tbody > tr:nth-child(${getRowIndex(cell)}) > td:nth-child(${getColumnIndex(cell)})`;
                        removeCSSRule(cssSelector, false);
                        document.styleSheets[0].insertRule(`${cssSelector} {background-image:url('${["mountain", "city", "crown"][markType]}.png');background-position:center center;background-repeat:no-repeat;}`, 0);
                    }
                }
            }
        }

        // Compute the difference in the number of cities (1v1 only)
        // ========================
        function readLeaderboard () {
            let res = []; // res[team_number][player_number] = {color: ?, army: ?, land: ?}
            let curTeam = [], playerBelongsToTeam = false;
            for(let tr of leaderBoard.querySelectorAll(`tr:not(.dead):not(:nth-child(1))`)) {
                if(tr.innerHTML.indexOf("Team") != -1) { // Team row
                    if(curTeam.length != 0) res.push(curTeam);
                    curTeam = [];
                    playerBelongsToTeam = true;
                }
                else { // Player row
                    let player = {
                        color: findColorClass(tr.querySelector("td:nth-last-child(3)").className),
                        army: Number(tr.querySelector("td:nth-last-child(2)").innerText),
                        land: Number(tr.querySelector("td:nth-last-child(1)").innerText)
                    };
                    if(playerBelongsToTeam) curTeam.push(player);
                    else res.push([player]);
                }
            }
            if(curTeam.length != 0) res.push(curTeam);
            return res;
        }
        let parsedLeaderboard = readLeaderboard();
        // Use of `ownColor` and `teamColors` requires `!isReplay`
        let ownColor = findColorClass(gameMap.querySelector("td.general.selectable").className);
        let teamColors = []; // Collection of all colors of your teammates (including yourself)
        for(let team of parsedLeaderboard) {
            let isOwnTeam = false, colors = [];
            for(let player of team) {
                if(player.color == ownColor) isOwnTeam = true;
                colors.push(player.color);
            }
            if(isOwnTeam) teamColors = colors;
        }

        if(!isReplay && parsedLeaderboard.length == 2) {
            let curState = {
                turn: undefined, // Caution: 'turn' is multiplied by 2
                ownArmy: undefined,
                enemyArmy: undefined
            };
            // Read current state
            {
                let turnText = document.getElementById('turn-counter').innerText.split(" ")[1];
                curState.turn = Number(turnText) * 2 + (turnText[turnText.length - 1] == "." ? 1 : 0);
                for(let team of parsedLeaderboard) {
                    let isOwnTeam = false, totalArmy = 0;
                    for(let player of team) {
                        if(player.color == ownColor) isOwnTeam = true;
                        totalArmy += player.army;
                    }
                    if(isOwnTeam) curState.ownArmy = totalArmy;
                    else curState.enemyArmy = totalArmy;
                }
            }
            if(isValidState(prevState) && isValidState(curState) && div(curState.turn, 2) != div(prevState.turn, 2) && div(curState.turn, 50) == div(prevState.turn, 50)) {
                let delta = div(curState.turn, 2) - div(prevState.turn, 2), // Number of times of city recruitment between 2 ticks
                    deltaOwn = curState.ownArmy - prevState.ownArmy,
                    deltaEnemy = curState.enemyArmy - prevState.enemyArmy;
                let deltaCities = div(deltaOwn - deltaEnemy, delta);
                if(Math.abs(deltaCities) <= 20) {
                    removeCSSRule(`delta-cities-span`, false);
                    document.styleSheets[0].insertRule(`#delta-cities-span:after {content:"${signedNum(deltaCities)}"}`);
                }
            }
            prevState = JSON.parse(JSON.stringify(curState));
        }
        if(!isReplay && parsedLeaderboard.length != 2) {
            removeCSSRule(`delta-cities-span`, false);
            document.styleSheets[0].insertRule(`#delta-cities-span:after {content:"--"}`);
        }

        // If army is enough to annihilate your enemy, do it.
        // =========================
        if(annihilateCooldown > 0) annihilateCooldown--;
        if(!isReplay) {
            let enemyGenerals = gameMap.querySelectorAll("td.general:not(.selectable)");
            for(let enemyGeneral of enemyGenerals) {
                if(teamColors.includes(findColorClass(enemyGeneral.className))) continue;
                let enemyArmy = parseArmyNum(enemyGeneral.innerText);
                let row = getRowIndex(enemyGeneral), col = getColumnIndex(enemyGeneral);
                let directions = [[0,1,"a",65], [0,-1,"d",68], [-1,0,"s",83], [1,0,"w",87]];
                for(let dir of directions) {
                    let cell = gameMap.querySelector(`tr:nth-child(${row + dir[0]}) > td:nth-child(${col + dir[1]})`);
                    if(!!cell && cell.classList.contains("selectable") && parseArmyNum(cell.innerText) >= enemyArmy + 2 && annihilateCooldown == 0) {
                        console.debug("Annihilate your enemy!");
                        annihilateCooldown = 7;
                        let origTime = (new Date()).getTime();
                        blockUserInput = true;
                        window.dispatchEvent(new KeyboardEvent("keydown", {key: "q", keyCode: 81, which: 81, isTrusted: false}));
                        await sleep(1);
                        cell.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, buttons: 1, which: 1, isTrusted: false}));
                        await sleep(1);
                        cell.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, buttons: 0, which: 1, isTrusted: false}));
                        await sleep(1);
                        window.dispatchEvent(new KeyboardEvent("keydown", {key: dir[2], keyCode: dir[3], which: dir[3], isTrusted: false}));
                        await sleep(1);
                        blockUserInput = false;
                        let nowTime = (new Date()).getTime();
                        console.debug(`Blocked user input for ${nowTime - origTime} milliseconds.`);
                    }
                }
            }
        }
    }
}

function gameOverCallback () {
    checkGameStart = setInterval(() => {
        if(!!document.getElementById('gameMap') && !document.querySelector(".alert.center > center > h1")) {
            gameStartCallback();
            clearInterval(checkGameStart);
        }
    }, 500);
    console.debug(`Game over.`);

    clearInterval(tickIntervalID);
    tickIntervalID = -1;

    if(!isReplay) document.styleSheets[0].insertRule(`#delta-cities-div {display:none}`);
}
