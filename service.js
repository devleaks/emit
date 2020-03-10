const fs = require('fs')
const parse = require('csv-parse/lib/sync')
const moment = require('moment')

var program = require('commander')

const geojson = require('./lib/geojson-util')
const service = require('./lib/service-lib.js')
const debug = require('./lib/debug')

const config = require('./sim-config')

const airportData = require('./lib/airport.js')

var airport = airportData.init(config)

program
    .version('2.4.0')
    .description('generates GeoJSON features for aircraft service. Creates a single truck for each service')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .option('-f, --file <file>', 'CSV file with list of services to perform')
    .option('-s, --start <parking>', 'Default place name to start service from. Must be in format "databaseName:positionName". Example: parkings:126', 'pois:FUEL1')
    .option('-p, --park', 'Append a last trip to send service vehicle to base station')
    .option('-t, --technical', 'Add payload to Point')
    .option('-l, --service-list <services>', 'Comma separated list of services example: fuel,catering', 'fuel')
    .option('-c, --count <count>', 'Generate a random service file with «count» parkings to visit', 10)
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

var services = []

if (program.file) {
    const csvstring = fs.readFileSync(program.file, 'utf8')
    const records = parse(csvstring, { columns: true })
    records.forEach(function(s, idx) {
        services.push(s)
    })
} else {
    var now = moment()
    for (var i = 0; i < program.count; i++) {
        const servlist = program.serviceList.split(',')
        var p = airportData.randomParking()
        var serv = servlist[Math.floor(Math.random() * servlist.length)]
        var print = true

        switch (serv) {
            case 'fuel':
                services.push({ "service": "fuel", "parking": p, "qty": (4000 + Math.floor(Math.random() * 10) * 100), "datetime": now.toISOString(), "datetime-max": null, "priority": 3 })
                break
            case 'catering':
                services.push({ "service": "catering", "parking": p, "qty": Math.floor(Math.random() * 2), "datetime": null, "datetime-max": null, "priority": 3 })
                break
            case 'sewage':
                services.push({ "service": "sewage", "parking": p, "qty": 1, "datetime": null, "datetime-max": null, "priority": 2 })
                break
            case 'cargo': // this only works if we load sim-config-transport
                services.push({ "service": "cargo", "parking": p, "qty": 4 + Math.floor(Math.random() * 10), "datetime": null, "datetime-max": null, "priority": 2 })
                break
            default:
                debug.warning("unknown or unconfigured service " + serv + ".")
                print = false
        }
        if (print) {
            t = services[services.length - 1]
            debug.print(t.service, t.parking, t.qty, t.datetime, t.priority)
            print = true
        }
    }
}


var trucks = service.doServices(services, airport, program)

var features = []
for (var svc in trucks) {
    if (trucks.hasOwnProperty(svc)) {

        trucks[svc].forEach(function(truck, idx) {
            var f = truck.getFeatures()
            features = features.concat(f)
            // add remarkable point
            var p = truck._points
            if (p && p.length > 0)
                features = features.concat(p)
        })
    }
}

fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.output + ' written')