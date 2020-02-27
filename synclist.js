/*
 * Color feature adds a (stroke) color to a feature depending on the feature type.
 * The feature type is a number between 0 and 17. Feature types are documented here:
 * http://download.naviter.com/docs/cup_format.pdf
 * Source file is a FeatureCollection, goemetries can be anything.
 * FeatureCollection results from the transformation of a SeeYou file (cup) to GeoJSON.
 * Color is added as a feature property suitable for geojson.io display.
 *
 */
const fs = require('fs')
var program = require('commander')
const debug = require('./lib/debug')

debug.init(true, [""])

program
    .version('1.0.0')
    .description('List sync points')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.print(program.opts())
debug.init(program.debug, ["pc"])

var cnt = 0
var last = false
var finish = false

function pc(f) {
     if (f.type == "FeatureCollection") {
        f.features = f.features.sort((a, b) => (a.properties.elapsed > b.properties.elapsed) ? 1 : -1)
        f.features.forEach(function(f1, idx) {
            pc(f1)
        })
        debug.print(cnt++, last, "last")
        debug.print(cnt++, finish, "finished")
    } else if (f.type == "Feature") {
        if (f.hasOwnProperty("properties") && f.properties.hasOwnProperty("emit")) {
            if (f.properties.hasOwnProperty("sync")) {
                debug.print(cnt++, f.properties.hasOwnProperty("elapsed") ? f.properties.elapsed : f.properties.scheduled, f.properties.sync)
            }
            if(f.properties.hasOwnProperty("category") && f.properties.category == "f") {
                last = f                
            }
            finish = f   
        }
    }
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
console.log("event", "elapsed", "name")
var pc = pc(JSON.parse(jsonstring))