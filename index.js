// vers 1.0.0

const dropsToIgnore = [
	8025, // Keening Dawn Mote
	8000, // Rejuvenation Mote
	8001, // HP Recovery Mote
	8002, // MP Replenishment Mote
	8005, // Healing Mote
	8008, 8009, 8010, 8011, 8012, 8013, 8014, 8015, 8016, 8017, 8018, // mystic hp motes
	8023, // mystic mana mote
	169886, 169887, 169888, 169889, 169890, 169891 // strongboxes
];

const format = require('./format.js');

module.exports = function DropitemExpiry(dispatch) {
	let enabled = true,
	playerId,
	expiryTimers = [];
		
    const chatHook = event => {		
		let command = format.stripTags(event.message).split(' ');
		
		if (['!dropitems'].includes(command[0].toLowerCase())) {
			listTimers();
			return false;
		} else if (['!toggledropitems'].includes(command[0].toLowerCase())) {
			toggleModule();
			return false;
		}
	}
	dispatch.hook('C_CHAT', 1, chatHook)	
	dispatch.hook('C_WHISPER', 1, chatHook)
  	
	// slash support
	try {
		const Slash = require('slash')
		const slash = new Slash(dispatch)
		slash.on('dropitems', args => listTimers())
		slash.on('toggledropitems', args => toggleModule())
	} catch (e) {
		// do nothing because slash is optional
	}
	
	function listTimers() {
		for (let i in expiryTimers) {
			systemMessage((expiryTimers[i].itemCount > 1 ? (expiryTimers[i].itemCount + ' drops') : '1 drop') + ' will expire in ' + expiryTimers[i].secondsRemaining + 's');
		}
	}
	
	function toggleModule() {
		enabled = !enabled;
		systemMessage((enabled ? 'enabled' : 'disabled'));
	}
	
	dispatch.hook('S_SPAWN_DROPITEM', 1, (event) => {
		/*
		"unk1 = 1" when the drop initially spawns.
		"unk1 = 0" when it respawns, say if the player walks away far enough that the drop gets culled and then the player comes back.
		event.expiry will steadily decrease at the same pace if you stay near, but if you respawn the drop (so unk1 = 0) then the expiry countdown will be inaccurate as it 
		dramatically hastens for some reason, so much so that it will even go negative. I can't figure out what's going on, so I have to ignore the drop if it despawns and respawns...
		*/
		if (event.unk1 == 0) return;
		
		//disregard if item is in ignore list
		if (dropsToIgnore.includes(event.item))
			return;
				
		//proceed if dropitem is yours
		let playerIsOwner = false;
		for(let i in event.owners) {
			if (event.owners[i].id == playerId) {
				playerIsOwner = true;
				break;
			}
		}
		if (!playerIsOwner) return;
				
		/*
		Expiry times are weird. Somehow 120,000 units = 5 mins and 3 secs ???
		So that means, 1 second = ~396 expiry time units. Maybe it's actually 400? I don't know...
		*/
		let dateNow = Date.now();
		let secondsRemaining = Math.floor(Math.abs(event.expiry) / 396);
		
		//group similar expiry times together
		let acceptableTimeDifference = 8000;
		for (let i in expiryTimers) {
			if ((dateNow + secondsRemaining * 1000) <  ((expiryTimers[i].time +  expiryTimers[i].secondsRemaining * 1000) + acceptableTimeDifference)) 
			{
				expiryTimers[i].id.push(event.id);
				expiryTimers[i].itemCount += 1;
				return;
			}			
		}
		
		//new timer
		expiryTimers.push({
			time: dateNow,
			id: [event.id],
			secondsRemaining: secondsRemaining,
			owners: event.owners,
			itemCount: 1
			});

		let thisId = expiryTimers[expiryTimers.length-1].id[0];
	
		// start timer
		let expiryTimer = setInterval(() => {	
 			// check if item and timer still exist
			let timerIndex = 0;
			let timerStillExists = false;
			for (let i in expiryTimers) {
				if (expiryTimers[i].id.includes(event.id)) {
					timerStillExists = true;
					timerIndex = i;
					break;
				}
				if (timerStillExists) break;
			}
 			if (!timerStillExists) {
				clearInterval(expiryTimer);
				return;
			}
			
			// display countdown in-game
			switch (expiryTimers[timerIndex].secondsRemaining) {
			case 60:
				if (enabled) systemMessage((expiryTimers[timerIndex].itemCount > 1 ? (expiryTimers[timerIndex].itemCount + ' drops') : '1 drop') + ' will expire in 60s');
				break
			case 30:
				if (enabled) systemMessage((expiryTimers[timerIndex].itemCount > 1 ? (expiryTimers[timerIndex].itemCount + ' drops') : '1 drop') + ' will expire in 30s');
				break
			case 10:
				if (enabled) systemMessage((expiryTimers[timerIndex].itemCount > 1 ? (expiryTimers[timerIndex].itemCount + ' drops') : '1 drop') + ' will expire in 10s');
				break
			case 0:
				clearInterval(expiryTimer);
				for (let i in expiryTimers) {
					if (expiryTimers[i].id.includes(event.id)) {
						expiryTimers.splice(i, 1);
						return;
					}
				}
				break;
			}
			expiryTimers[timerIndex].secondsRemaining -= 1
		}, 1000)
		
	})
/*  
	dispatch.hook('C_TRY_LOOT_DROPITEM', 1, (event) => {
		console.log('\n C_TRY_LOOT_DROPITEM ' + event.id);		
	})
 */
	//Despawn can happen 3 ways: Picking up the item, time expiring, and if player leaves the proximity of the item (it can still exist in world).
	dispatch.hook('S_DESPAWN_DROPITEM', 1, (event) => {
		for (let i in expiryTimers) {
			for (let j in expiryTimers[i].id) {
				if (expiryTimers[i].id[j] - event.id == 0) {
					expiryTimers[i].id.splice(j, 1);
					if (expiryTimers[i].id.length == 0) {
						expiryTimers.splice(i, 1);
					}
					return;
				}
			}
		}
	})
		
	dispatch.hook('S_LOGIN', 2, (event) => {
		playerId = event.playerId;
	})
	
	dispatch.hook('S_SPAWN_ME', 1, (event) => {
		expiryTimers = [];
	})
		
	function systemMessage(msg) {

		dispatch.toClient('S_CHAT', 1, {
			channel: 24,
			authorID: 0,
			unk1: 0,
			gm: 0,
			unk2: 0,
			authorName: '',
			message: ' (Dropitem-Expiry) ' + msg
		});
	}

}