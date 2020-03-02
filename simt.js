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
const handler = roadsData.randomHandler(config.services)

program
    .version('1.0.0')
    .description('generates GeoJSON features for one aircraft takeoff or landing')
    .option('-d, --debug', 'output extra debugging')
    .option('-o, --output <file>', 'Save to file, default to out.json', "out.json")
    .option('-m, --truck <model>', 'Truck model', trucksData.randomTruckModel())
    .option('-c, --carrier <carrier>', 'name of handler/carrier', handler)
    .option('-p, --parking <parking>', 'name of parking', roadsData.randomParking(config.services, handler))
    .option('-b, --destination <destination>', 'name of origin or destination', roadsData.randomHighway())
    .option('-l, --arriving', 'Perform arriving rather than leaving', isArriving)
    .parse(process.argv)

debug.init(program.debug, ["", "leave"])
debug.print(program.opts())

var truck = program.arriving ?
    simulator.arrive(roads, truck_name, program.truck, program.parking, program.destination) :
    simulator.leave(roads, truck_name, program.truck, program.parking, program.destination)

if (truck) {
    fs.writeFileSync(program.output, JSON.stringify(geojson.FeatureCollection(truck.getFeatures(true))), { mode: 0o644 })
    console.log(program.output + ' written')
    console.log('Truck '+truck_name+(program.arriving ? ' arrives from ' : ' leaves for ')+program.destination+" (parking "+program.parking+")")
} else {
    console.log(program.opts())
    console.log('no file written')
}