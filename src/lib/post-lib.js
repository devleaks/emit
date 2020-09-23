import moment from "moment";
import * as debug from "./debug.js";
import * as simview from "./simview.js";


function send(senders, data) {
    senders.forEach(function each(sender) {
        sender(data)
    });
}


function _post(senders, records, options) {
    if (records.length > 0) {
        const r = records.shift()
        const obj = simview.convert(r, options)
        if (obj) {
            if (Array.isArray(obj)) {
                obj.forEach(function(msg) {
                    send(senders, JSON.stringify(msg))
                })
            } else {
                send(senders, JSON.stringify(obj))
            }
            // console.log(util.inspect(obj, false, null, true /* enable colors */))
        }
        if (records.length > 0) {
            const n = records[0].split(",")
            const p = r.split(",")
            var w = options.rate
            if (options.speed) {
                const f = parseFloat(options.speed)
                if (f > 0) {
                    var duration = moment(n[2], moment.ISO_8601).diff(moment(p[2], moment.ISO_8601))
                    w = moment.duration(duration).asSeconds() / f
                }
            }
            debug.print(p[0], p[1])
            debug.print( /*p[0],p[1],*/ "waiting " + (Math.round(w * 100) / 100) + " secs...", records.length + " left")
            setTimeout(_post, w * 1000, senders, records, options)
        } else {
            console.log("finished")
        }
    }
}



export const post = function(senders, records, options) {
    const r = records.pop() // last line may be empty
    if (r != "") {
        records.push(r)
    }
    const dt = simview.getDateTime(records[0])
    const siminfo = "siminfo,sync," + dt + "," + options.speed + "," + options.rate + "," + options.wait
    console.log(siminfo)
    records.unshift(siminfo)
    const i = parseInt(options.wait)
    console.log("starting in " + i + " seconds")
    setTimeout(_post, i * 1000, senders, records, options)
    // _post(records, options)
};