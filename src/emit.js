import fs from "fs";
import turf from "@turf/turf";
import program from "commander";
import * as emit from "./lib/emit-lib.js";
import * as debug from "./lib/debug.js";

program
    .version("2.2.0")
    .description("replaces all linestrings in geojson file with timed linestrings (best run one LS at a time)")
    .option("-d, --debug", "output extra debugging")
    .option("-o, --output <file>", "Save to file, default to out.json", "out.json")
    .requiredOption("-f, --file <file>", "GeoJSON file to process")
    .option("-s, --speed <speed>", "Speed of vehicle in km/h", 30)
    .option("-a, --altitude", "Add altitude to GeoJSON positions")
    .option("-r, --rate <rate>", "Rate of event report in seconds, default 30 s", 30)
    .option("-j, --jitter <distance>", "GPS precision in meter", 0)
    .option("-q, --quiet", "Does not report position when stopped")
    .option("--min-speed <speed>", "Minimum speed for objects (km/h)", 5)
    .option("-v, --vertices", "Emit event at vertices (change of direction)")
    .option("-l, --last-point", "Emit event at last point of line string, even if time rate is not elapsed")
    .parse(process.argv)

debug.init(program.debug, [""])
debug.print(program.opts())

/* MAIN
 */
const jsonstring = fs.readFileSync(program.file, "utf8")
const fc = emit.emitGeoJSON(JSON.parse(jsonstring), program)
fs.writeFileSync(program.output, JSON.stringify(fc), { mode: 0o644 })
debug.print(program.output + " written")
