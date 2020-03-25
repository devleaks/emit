const fs = require('fs')

_messages = [] // array of strings

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