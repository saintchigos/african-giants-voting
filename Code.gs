// ============================================================
//  AFRICAN GIANTS — THE LAST DANCE  |  Voting Backend
//  Paste this entire file into Google Apps Script
// ============================================================

const ADMIN_PASSWORD = ScriptProperties.getProperty('ADMIN_PASSWORD') || "";

// Room configuration
const SINGLE_ROOMS = [77,78,79,81,82,84,85,88,89,91,92,94,95,96,97,98,99,
  101,102,104,105,108,109,111,112,114,115,116,117,118,120,121,123,124,
  127,128,130,131,133,134,135,136,137,139,140,142,143,146,147,149,150,152,153];

const DOUBLE_ROOMS = [80,83,86,87,90,93,103,106,107,110,113,119,122,125,
  126,129,132,138,141,144,145,148,151];

// Room 100 is a double but only 1 person stays → 1 vote
const SPECIAL_ROOMS = { 100: 1 };

function getMaxVotes(room) {
  const r = parseInt(room);
  if (SPECIAL_ROOMS[r] !== undefined) return SPECIAL_ROOMS[r];
  if (SINGLE_ROOMS.includes(r)) return 1;
  if (DOUBLE_ROOMS.includes(r)) return 2;
  return 0;
}

// ── Sheet helpers ────────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'Awards')    sheet.appendRow(['id','name','emoji','order']);
    if (name === 'Nominees')  sheet.appendRow(['id','award_id','name','image_url']);
    if (name === 'Voters')    sheet.appendRow(['id','name','room','timestamp','flagged']);
    if (name === 'Votes')     sheet.appendRow(['voter_id','award_id','nominee_id']);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── GET handler ──────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || '';
  const password = e.parameter.password || '';

  if (action === 'getAwards')  return jsonResponse(getAwards());
  if (action === 'checkRoom')  return jsonResponse(checkRoom(e.parameter.room));

  if (password !== ADMIN_PASSWORD) return jsonResponse({ error: 'Unauthorized' });

  if (action === 'getResults') return jsonResponse(getResults());
  if (action === 'getVoters')  return jsonResponse(getVoters());
  if (action === 'getFlagged') return jsonResponse(getFlagged());

  return jsonResponse({ error: 'Invalid action' });
}

// ── POST handler ─────────────────────────────────────────────
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action || '';
  const password = data.password || '';

  if (action === 'submitVote') return jsonResponse(submitVote(data));

  if (password !== ADMIN_PASSWORD) return jsonResponse({ error: 'Unauthorized' });

  if (action === 'addAward')      return jsonResponse(addAward(data));
  if (action === 'removeAward')   return jsonResponse(removeAward(data));
  if (action === 'addNominee')    return jsonResponse(addNominee(data));
  if (action === 'removeNominee') return jsonResponse(removeNominee(data));
  if (action === 'removeVoter')   return jsonResponse(removeVoter(data));
  if (action === 'clearFlag')     return jsonResponse(clearFlag(data));

  return jsonResponse({ error: 'Invalid action' });
}

// ── Public functions ─────────────────────────────────────────
function getAwards() {
  const awards = sheetToObjects(getSheet('Awards'))
    .sort((a, b) => a.order - b.order);
  const nominees = sheetToObjects(getSheet('Nominees'));
  return awards.map(a => ({
    ...a,
    nominees: nominees.filter(n => n.award_id === a.id)
  }));
}

function checkRoom(room) {
  const r = parseInt(room);
  const maxVotes = getMaxVotes(r);
  if (maxVotes === 0) return { eligible: false, reason: 'Room not on eligible list' };

  const voters = sheetToObjects(getSheet('Voters'));
  const roomVoters = voters.filter(v => parseInt(v.room) === r);
  const usedVotes = roomVoters.length;

  return {
    eligible: true,
    maxVotes,
    usedVotes,
    canVote: usedVotes < maxVotes,
    flagged: usedVotes > maxVotes
  };
}

function submitVote(data) {
  const { name, room, votes } = data;
  const r = parseInt(room);
  const maxVotes = getMaxVotes(r);

  if (maxVotes === 0) return { success: false, error: 'Room not eligible' };

  const voterSheet = getSheet('Voters');
  const voteSheet  = getSheet('Votes');
  const voters     = sheetToObjects(voterSheet);
  const roomVoters = voters.filter(v => parseInt(v.room) === r);
  const usedVotes  = roomVoters.length;

  const voterId  = 'v_' + Date.now();
  const flagged  = (usedVotes + 1) > maxVotes;
  const timestamp = new Date().toISOString();

  voterSheet.appendRow([voterId, name, room, timestamp, flagged ? 'FLAGGED' : '']);

  // If room was already over limit, flag all voters in that room
  if (flagged) {
    flagRoomVoters(room);
  }

  // Save individual award votes
  Object.entries(votes).forEach(([awardId, nomineeId]) => {
    voteSheet.appendRow([voterId, awardId, nomineeId]);
  });

  return { success: true, flagged };
}

function flagRoomVoters(room) {
  const sheet = getSheet('Voters');
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const roomIdx  = headers.indexOf('room');
  const flagIdx  = headers.indexOf('flagged');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][roomIdx]) === String(room)) {
      sheet.getRange(i + 1, flagIdx + 1).setValue('FLAGGED');
    }
  }
}

// ── Admin functions ──────────────────────────────────────────
function getResults() {
  const awards   = getAwards();
  const votes    = sheetToObjects(getSheet('Votes'));
  const voters   = sheetToObjects(getSheet('Voters'));
  const validIds = voters.filter(v => v.flagged !== 'FLAGGED').map(v => v.id);

  return awards.map(award => {
    const counts = {};
    award.nominees.forEach(n => counts[n.id] = 0);
    votes
      .filter(v => v.award_id === award.id && validIds.includes(v.voter_id))
      .forEach(v => { if (counts[v.nominee_id] !== undefined) counts[v.nominee_id]++; });
    return {
      ...award,
      nominees: award.nominees.map(n => ({ ...n, votes: counts[n.id] || 0 }))
    };
  });
}

function getVoters() {
  return sheetToObjects(getSheet('Voters'))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getFlagged() {
  const voters = sheetToObjects(getSheet('Voters'))
    .filter(v => v.flagged === 'FLAGGED');
  const rooms  = {};
  voters.forEach(v => {
    if (!rooms[v.room]) rooms[v.room] = [];
    rooms[v.room].push(v);
  });
  return Object.entries(rooms).map(([room, voters]) => ({
    room,
    maxVotes: getMaxVotes(parseInt(room)),
    voters
  }));
}

function removeVoter(data) {
  const { voterId } = data;
  const voterSheet  = getSheet('Voters');
  const voteSheet   = getSheet('Votes');
  const voterData   = voterSheet.getDataRange().getValues();
  const voteData    = voteSheet.getDataRange().getValues();

  // Remove from Voters sheet
  for (let i = voterData.length - 1; i >= 1; i--) {
    if (voterData[i][0] === voterId) {
      voterSheet.deleteRow(i + 1);
      break;
    }
  }

  // Remove their votes
  for (let i = voteData.length - 1; i >= 1; i--) {
    if (voteData[i][0] === voterId) {
      voteSheet.deleteRow(i + 1);
    }
  }

  // Re-check if room is still over limit; if not, clear flags
  const room = voterData.slice(1).find(r => r[0] === voterId)?.[2];
  if (room) recheckRoomFlag(room);

  return { success: true };
}

function recheckRoomFlag(room) {
  const sheet      = getSheet('Voters');
  const data       = sheet.getDataRange().getValues();
  const headers    = data[0];
  const roomIdx    = headers.indexOf('room');
  const flagIdx    = headers.indexOf('flagged');
  const roomRows   = data.slice(1).filter(r => String(r[roomIdx]) === String(room));
  const maxVotes   = getMaxVotes(parseInt(room));

  if (roomRows.length <= maxVotes) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][roomIdx]) === String(room)) {
        sheet.getRange(i + 1, flagIdx + 1).setValue('');
      }
    }
  }
}

function clearFlag(data) {
  const { room } = data;
  const sheet = getSheet('Voters');
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];
  const roomIdx = headers.indexOf('room');
  const flagIdx = headers.indexOf('flagged');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][roomIdx]) === String(room)) {
      sheet.getRange(i + 1, flagIdx + 1).setValue('');
    }
  }
  return { success: true };
}

function addAward(data) {
  const sheet  = getSheet('Awards');
  const awards = sheetToObjects(sheet);
  const id     = 'aw_' + Date.now();
  const order  = awards.length + 1;
  sheet.appendRow([id, data.name, data.emoji || '', order]);
  return { success: true, id };
}

function removeAward(data) {
  const { awardId } = data;
  const sheet = getSheet('Awards');
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === awardId) { sheet.deleteRow(i + 1); break; }
  }
  // Also remove nominees for this award
  const nomSheet = getSheet('Nominees');
  const nomRows  = nomSheet.getDataRange().getValues();
  for (let i = nomRows.length - 1; i >= 1; i--) {
    if (nomRows[i][1] === awardId) nomSheet.deleteRow(i + 1);
  }
  return { success: true };
}

function addNominee(data) {
  const sheet = getSheet('Nominees');
  const id    = 'nm_' + Date.now();
  sheet.appendRow([id, data.awardId, data.name, data.imageUrl || '']);
  return { success: true, id };
}

function removeNominee(data) {
  const sheet = getSheet('Nominees');
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === data.nomineeId) { sheet.deleteRow(i + 1); break; }
  }
  return { success: true };
}
