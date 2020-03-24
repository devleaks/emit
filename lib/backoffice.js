const fs = require('fs')
const moment = require('moment')

_messages = [] // array of strings
_wire = []

function quote(s) {
    return "'" + s + "'"
}

//
exports.announce = function(queue, purpose, timestamp, message) {
    _messages.push(queue + "," + purpose + "," + timestamp + "," + quote(typeof message == "string" ? message : JSON.stringify(message)))
}

//
exports.save = function(fn, debug = false) {
    fs.writeFileSync(fn, _messages.join("\n")+"\n", { mode: 0o644 })
    if (debug)
        console.log(fn + ' written')
}


exports.wire = function(timestamp, message) {
    _wire.push("aodb,wire," + timestamp + "," + quote(typeof message == "string" ? message : JSON.stringify(message)))
}


exports.export_wire = function(fn, debug = false) {
    fs.writeFileSync(fn, _wire.join("\n")+"\n", { mode: 0o644 })
    if (debug)
        console.log(fn + ' written')
}