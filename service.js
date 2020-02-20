const fs = require('fs')
const parse = require('csv-parse/lib/sync')

var program = require('commander')

const geojson = require('./lib/geojson-util')
const service = require('./lib/service-lib.js')
const debug = require('./lib/debug.js')

const config = require('./sim-config')

program
    .version('2.1.0')
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

debug.init(program.debug, [""], "main")
debug.print(program.opts())

var airport = service.readAirport(config)

var services = []

if (program.file) {
    const csvstring = fs.readFileSync(program.file, 'utf8')
    const records = parse(csvstring, { columns: true })
    records.forEach(function(s, idx) {
        services.push(s)
    })
} else {
    const parkingfc = airport.parkings.features
    for (var i = 0; i < program.count; i++) {
        var print = true
        var p = parkingfc[Math.floor(Math.random() * (parkingfc.length))]
        var servlist = program.serviceList.split(',')
        var serv = servlist[Math.floor(Math.random() * servlist.length)]
        switch (serv) {
            case 'fuel':
                services.push({ "service": "fuel", "parking": p.properties.name, "qty": (4000 + Math.floor(Math.random() * 10) * 100), "datetime": null, "priority": 3 })
                break
            case 'catering':
                services.push({ "service": "catering", "parking": p.properties.name, "qty": Math.floor(Math.random() * 2), "datetime": null, "priority": 3 })
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
        const truck = trucks[svc]
        var f = truck.getFeatures()
        features = features.concat(f)
        // add remarkable point
        var p = truck._points
        if (p && p.length > 0)
            features = features.concat(p)
    }
}

fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(features)), { mode: 0o644 })
debug.print(program.output + ' written')