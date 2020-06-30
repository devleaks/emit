import fs from "fs";
import * as debug from "./debug.js";
import * as geojson from "./geojson-util.js";

let _trucks

export const init = function(config) {
    _trucks = config.trucks
    return _trucks
};

/*
 */
export const randomTruckModel = function(type = false) {
    let ret = Object.keys(_trucks["truck-models"])
    if(ret.length < 1) {
        debug.warning("no aircraft of type '"+type+"' found")
        ret = Object.keys(_aircrafts)
    }
    return geojson.randomElemFrom(ret)
};

export const findModel = function(model) {
  return _trucks["truck-models"][model]
};

export const randomTruckname = function(prefix = "T") {
  return prefix + Math.floor(Math.random() * 10000)
};