import fs from 'fs';

let _messages = [] // array of strings

function quote(s) {
    return "'" + s + "'"
}

//
export const announce = function(queue, purpose, timestamp, message) {
    _messages.push(queue + "," + purpose + "," + timestamp + "," + quote(typeof message == "string" ? message : JSON.stringify(message)))
};

//
export const save = function(fn, debug = false) {
    fs.writeFileSync(fn, _messages.join("\n")+"\n", { mode: 0o644 })
    if (debug)
        console.log(fn + ' written')
};