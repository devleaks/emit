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
const turf = require('@turf/turf')
const convert = require('color-convert')
var program = require('commander')
const debug = require('./debug.js')

debug.init(true, [""], "main")

program
    .version('1.0.0')
    .description('Color point of interest depending on type')
    .option('-d, --debug', 'output extra debugging')
    .requiredOption('-f, --file <file>', 'GeoJSON file to process')
    .parse(process.argv)

debug.print(program.opts())

function centroid(polygon) {
  return polygon
}

var depth = 0
function pc(f) {
    depth++

    debug.print(">".repeat(depth)+(f.type == "Feature" ? f.type+"("+f.geometry.type+")": f.type))
    if(f.type == "FeatureCollection") {
        f.features.forEach(function(f1, idx) {
            f.features[idx] = pc(f.features[idx])
        })
        return f
    } else if(f.type == "Feature") {
      if(f.geometry.coordinates.length < 2) {
        console.log(f)
        return
      }
      if(f.properties && f.properties.style) {
        color = "#" + convert.rgb.hex(convert.hsl.rgb(20 * f.properties.style,80,80))
        f.properties["marker-color"] = color
        f.properties["marker-size"] = "medium"
        f.properties["marker-symbol"] = ""

      }
      return f
    }
}

const jsonstring = fs.readFileSync(program.file, 'utf8')
var pc = pc(JSON.parse(jsonstring))

fs.writeFileSync('out.json', JSON.stringify(pc), { mode: 0o644 })
console.log('out.json written')