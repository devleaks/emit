const fs = require('fs')

var program = require('commander')

const PathFinder = require('geojson-path-finder');
const geojsonTool = require('geojson-tools')

const geojson = require('./lib/geojson-util')
const debug = require('./lib/debug')

const simulator = require('./lib/transport-lib.js')

const config = require('./sim-config-transport')
const roadsData = require('./lib/roads.js')
const trucksData = require('./lib/truck.js')

var roads = roadsData.init(config)
var trucks = trucksData.init(config)

const isArriving = Math.random() > 0.5
const truck_name = 'T' + Math.floor(Math.random() * 10000)
const handler = roadsData.randomHandler()

program
    .version('1.0.0')
    .description('generates GeoJSON features for one truck leaving or arriving at warehouse')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .option('-m, --truck <model>', 'Truck model', trucksData.randomTruckModel())
    .option('-w, --warehouse <warehouse>', 'name of handler warehouse', handler)
    .option('-p, --parking <parking>', 'name of parking')
    .option('-b, --destination <destination>', 'name of origin or destination', roadsData.randomHighway())
    .option('-l, --arriving', 'Perform arriving rather than leaving', isArriving)
    .parse(process.argv)

debug.init(program.debug, ["", "leave"])
debug.print(program.opts())


var t1 = roadsData.parkingAvailable("S22:0", "2020-03-05T07:54:24.484+01:00","2020-03-05T09:54:24.484+01:00")
debug.print("parking 1", t1)

roadsData.park("S22:0", "2020-03-05T09:54:25.484+01:00","2020-03-05T10:54:24.484+01:00")

var t2 = roadsData.parkingAvailable("S22:0", "2020-03-05T07:54:24.484+01:00","2020-03-05T09:54:24.484+01:00")
debug.print("parking 2", t2)

var t3 = roadsData.findParking("2020-03-05T07:54:24.484+01:00","2020-03-05T09:54:26.484+01:00", "handler1")
debug.print("parking 3", t3)

var parking = program.warehouse ? roadsData.randomParking(program.warehouse) : roadsData.randomParking(handler)
var truck = program.arriving ?
    simulator.arrive(roads, truck_name, program.truck, parking, program.destination) :
    simulator.leave(roads, truck_name, program.truck, parking, program.destination)

if (truck) {
    fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(truck.getFeatures(true))), { mode: 0o644 })
    debug.print(program.output + ' written')
    debug.print('Truck '+truck_name+(program.arriving ? ' arrives from ' : ' leaves for ')+program.destination+" for "+handler+" (parking "+parking+")")
} else {
    debug.print(program.opts())
    debug.print('no file written')
}