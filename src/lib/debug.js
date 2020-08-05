let _FUNCNAME = []
let _MAIN = "()"
let _DEBUG = false

export const init = function (d, f, m = "()") {
  _DEBUG = d
  _FUNCNAME = f // should be an array
  _MAIN = m
};

const SPECIAL_CALLERS = ["file:","Timeo"]

export const print = function(...args) {
//    console.log(util.inspect(options._syncers, {showHidden: false, depth: null, colors: true}))
    if (_DEBUG) {
        let caller = (new Error()).stack.split("\n")[2].trim().split(" ")[1] // print.caller ? print.caller : {"name": _MAIN}
        // console.log("caller", caller)
        if(SPECIAL_CALLERS.indexOf(caller.substr(0,5)) >= 0) { // calls from "top level"
          caller = ""
        }
        if (_FUNCNAME.indexOf(caller) >= 0)
            console.log(caller == "" ? ">>>" : caller, args)
    }
};

export const warning = function (...args) { // always print error
    const caller = (new Error()).stack.split("\n")[2].trim().split(" ")[1] // warning.caller ? warning.caller : { "name": _MAIN }
    console.log(caller, args)
};

export const error = function (...args) { // always print error
    const caller = (new Error()).stack.split("\n")[2].trim().split(" ")[1] // error.caller ? error.caller : { "name": _MAIN }
    console.log(caller, args)
};

export const funcname = function (f) {
  if(Array.isArray(f))
    _FUNCNAME = _FUNCNAME.concat(f)
  else // f should then be a string...
    _FUNCNAME.push(f)
};