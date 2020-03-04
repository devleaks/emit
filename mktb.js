const fs = require('fs')
const moment = require('moment')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const debug = require('./lib/debug')

const config = require('./sim-config-transport')
const roadsData = require('./lib/roads.js')
const trucksData = require('./lib/truck.js')

var roads = roadsData.init(config)
var trucks = trucksData.init(config)


// round to next 5 minutes
const now = moment();
const now5 = moment(now).add(5 - (now.minute() % 5), "minutes").add(- now.second(), "seconds").add(- now.millisecond(), "milliseconds")

program
    .version('1.1.0')
    .description('generates tranport board')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.csv', "out.csv")
    .requiredOption('-c, --count <count>', 'Count of zigzags')
    .option('-w, --warehouse <warehouse>', 'name of handler warehouse')
    .option('-s, --start-date <date>', 'Start date of event reporting, default to now', now5.toISOString())
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

function rndInt(n) {
    return Math.floor(Math.random() * n)
}

function nextTransport(n) {
    const p = config.simulation["time-between-transports"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1]-p[0]) / 5))
}

function turnAround() {
    const p = config.simulation["loading-time"]
    return p[0] + 5 * rndInt(Math.round(Math.abs(p[1]-p[0]) / 5))
}

function randomTruckboard(cnt, startdate, type = false) {
    var txt = 'move,handler,parking,truck,destination,date,time\n'
    var time = startdate ? moment(startdate) : moment()

    for (var i = 0; i < cnt; i++) {
        const handler = program.warehouse ? program.warehouse : roadsData.randomHandler(config.services)
        var parking = roadsData.randomParking(config.services, handler)
        var truck = trucksData.randomTruckname()
        var dest = roadsData.randomHighway()
        time.add(nextTransport(2), 'm')
        // arrival
        debug.print('arrival', handler, truck, dest, time.format('HH:mm'), parking)
        txt += 'arrival,' + handler + ',' + parking + ',' + truck + ',' + dest + ',,' + time.format('HH:mm') + '\n'
        // turnaround
        var time2 = moment(time)
        time2.add(turnAround(), 'm')
        // departure
        dest = roadsData.randomHighway()
        truck = trucksData.randomTruckname()
        txt += 'departure,' + handler + ',' + parking + ',' + truck + ',' + dest + ',,' + time2.format('HH:mm') + '\n'
        debug.print('departure', handler, truck, dest, time2.format('HH:mm'), parking)
    }
    return txt
}

var s = randomTruckboard(program.count, program.startDate, program.type)
fs.writeFileSync(program.output, s, { mode: 0o644 })
debug.print(program.output + ' written')