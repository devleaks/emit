import moment from "moment";
import * as debug from "./debug.js";
import * as simview from "./simview.js";


function send(senders, data) {
    debug.print(data)
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
                    //console.dir(msg)
                    //debug.print(msg)
                    send(senders, JSON.stringify(msg))
                })
            } else {
                //console.dir(obj)
                //debug.print(JSON.stringify(obj, null, 2))
                send(senders, JSON.stringify(obj))
            }
            // console.log(util.inspect(obj, false, null, true /* enable colors */))
        }
        if (records.length > 0) {
            const n = simview.getDateTime(records[0])
            const p = simview.getDateTime(r)
            var w = options.rate
            if (options.speed) {
                const f = parseFloat(options.speed)
                if (f > 0) {
                    var duration = moment(n, moment.ISO_8601).diff(moment(p, moment.ISO_8601))
                    w = moment.duration(duration).asSeconds() / f
                }
            }
            debug.print("waiting " + (Math.round(w * 100) / 100) + " secs...", records.length + " left")
            setTimeout(_post, w * 1000, senders, records, options)
        } else {
            console.log("finished")
        }
    }
}



export const post = function(senders, records, options) {
    let r = records.pop() // last line may be empty
    while (r == "" && records.length > 0) {
        r = records.pop()
    }
    records.push(r)
    const dt = simview.getDateTime(records[0])
    const siminfo = "siminfo,sync," + dt + "," + options.speed + "," + options.rate + "," + options.wait
    console.log(siminfo)
    records.unshift(siminfo)
    let when = 0

    // need to skip messages?
    if (options.now) {
        const startTime = (options.now == "now") ? moment() : moment(options.now, moment.ISO_8601)
        console.log("Sending event after ", startTime.toISOString())
        let skipping = 0
        let forcesent = 0
        let nextTime = moment(dt, moment.ISO_8601)
        let next = records[0]

        debug.print("First record at ", nextTime.toISOString())

        while (startTime.isAfter(nextTime) && records.length > 0) {
            next = records.shift()
            const nextTimeString = simview.getDateTime(next)
            if (nextTimeString) {
                nextTime = moment(nextTimeString, moment.ISO_8601)

                if (options.forceSend) {
                    // debug.print("Force send event at ", nextTimeString)
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
                    forcesent++
                }

            } else {
                debug.print("no date?", next, records.length)
            }
            skipping++
        }

        if (records.length > 0) {
            debug.print((options.forceSend ? "Force sent " + forcesent : "Skipped " + skipping) + " messages. Next message at " + nextTime.toISOString())

            records.unshift(next) // put last message back on queue
            when = options.rate
            if (options.speed) {
                const f = parseFloat(options.speed)
                if (f > 0) {
                    var duration = nextTime.diff(startTime)
                    when = moment.duration(duration).asSeconds() / f
                }
            }
            debug.print("waiting " + (Math.round(when * 100) / 100) + " secs...", records.length + " left")
            when = when * 1000 // ms
        } else {
            debug.print("Skipped " + skipping + " messages. No more message to send.")
        }
    } else {
        const i = parseInt(options.wait)
        when = i * 1000
        debug.print("starting in " + i + " seconds")
    }

    if (records.length > 0) {
        setTimeout(_post, when, senders, records, options)
    }
};