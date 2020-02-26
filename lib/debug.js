const util = require('util')

var _FUNCNAME = []
var _MAIN = "()"
var _DEBUG = false

exports.init = function (d, f, m = "()") {
  _DEBUG = d
  _FUNCNAME = f // should be an array
  _MAIN = m
}

exports.print = function(...args) {
//    console.log(util.inspect(options._syncers, {showHidden: false, depth: null, colors: true}))
    if (_DEBUG) {
        var caller = exports.print.caller ? exports.print.caller : {"name": _MAIN}
        if (_FUNCNAME.indexOf(caller.name) >= 0)
            console.log(caller.name, args)
    }
}


exports.warning = function (...args) { // always print error
    const caller = exports.warning.caller ? exports.warning.caller : { "name": _MAIN }
    console.log(caller.name, args)
}


exports.error = function (...args) { // always print error
    const caller = exports.error.caller ? exports.error.caller : { "name": _MAIN }
    console.log(caller.name, args)
}


exports.funcname = function (f) {
  if(Array.isArray(f))
    _FUNCNAME = _FUNCNAME.concat(f)
  else // f should then be a string...
    _FUNCNAME.push(f)
}