/*
 * Parkings are supplied as a FetaureCollection of Polygons.
 * Parking centroid finds the centroid of each polygon and produces a FeatureCollection of Points.
 *
 */
const fs = require('fs')
const turf = require('@turf/turf')
var program = require('commander')

/* Produces debug based on program.debug option if it exist, otherwise constructor is supplied.
 * Function name must be part of valid list of functions to debug
 * Preceedes debug output with calling function name.
 */
function debug(...args) {
//  const program = { "debug": true , "funcname": false }
    if (typeof(program) != "undefined" && program.debug) {
        const MAIN = "main()"
        var FUNCDEBUG = [
            "", // always debug top-level
            MAIN// always debug functions with no name
        ]
        if(program.funcname)
            FUNCDEBUG.concat(program.funcname)
        var caller = debug.caller ? debug.caller : {"name": MAIN}

        if (FUNCDEBUG.indexOf(caller.name) >= 0)
            console.log(caller.name, args)
    }
}


program
    .version('1.0.0')
    .description('convert parking areas in parking centroïds')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug(program.opts())

function centroid(polygon) {
  return polygon
}

var depth = 0
function pc(f) {
    depth++

    debug(">".repeat(depth)+(f.type == "Feature" ? f.type+"("+f.geometry.type+")": f.type))
    if(f.type == "FeatureCollection") {
        f.features.forEach(function(f1, idx) {
            f.features[idx] = pc(f.features[idx])
        })
        return f
    } else if(f.type == "Feature") {
        if(f.geometry && f.geometry.type == "Polygon") {
          var c = turf.centroid(f)
          c.properties = {}
          c.properties.aeroways = "parking_position"    // OSM standard (https://wiki.openstreetmap.org/wiki/Key:aeroway)
          c.properties.ref = f.properties.ID_Parking
          c.properties.apron = f.properties.ID_Apron_z
          return c
        }
        return f
    }
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
var pc = pc(JSON.parse(jsonstring))

fs.writeFileSync('out.json', JSON.stringify(pc), { mode: 0o644 })
console.log('out.json written')