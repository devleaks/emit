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

debug.init(true, [""], "main")

program
    .version('1.0.0')
    .description('List sync points')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.print(program.opts())

var cnt = 0

function pc(f) {
    if(f.type == "FeatureCollection") {
        f.features.forEach(function(f1, idx) {
            f.features[idx] = pc(f.features[idx])
        })
    } else if(f.type == "Feature") {
      if(f.hasOwnProperty("properties") && f.properties.hasOwnProperty("sync")) {
        console.log(cnt++, f.properties.idx, f.properties.comment, f.properties.sync)
      }
    }
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
console.log("event", "name")
var pc = pc(JSON.parse(jsonstring))