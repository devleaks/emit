const fs = require('fs')
const moment = require('moment')

_messages = [] // array of strings
_wire = []
//
exports.announce = function(queue, purpose, timestamp, message) {
    _messages.push(queue + "," + purpose + "," + timestamp + "," + (typeof message == "string" ? message : JSON.stringify(message)))
}

//
exports.save = function(fn, debug = false) {
    fs.writeFileSync(fn, _messages.join("\n"), { mode: 0o644 })
    if (debug)
        console.log(fn + ' written')
}


exports.wire = function(timestamp, message) {
  _wire.push("wire," + timestamp + "," + (typeof message == "string" ? message : JSON.stringify(message)))
}


exports.export_wire = function(fn, debug = false) {
    fs.writeFileSync(fn, JSON.stringify(_wire), { mode: 0o644 })
    if (debug)
        console.log(fn + ' written')
}


