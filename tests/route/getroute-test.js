var PathFinder = require('geojson-path-finder');

// generates a max x max square grid of linestrings.
var fc = [];
var max = 3;
function add(x1, y1, x2, y2) {
	if(x1<0||y1<0||x2<0||y2<0) return;
	if(x1>max||y1>max||x2>max||y2>max) return;
	var ls = {
		"type": "Feature",
		"properties": {
			"name": "("+x1+','+y1+") to ("+x2+','+y2+")",
		},
		"geometry": {
			"type": "LineString",
			"coordinates": [ [ x1, y1 ], [ x2, y2 ] ]
		}
	}
	fc.push(ls);
}
for(var i = 0; i <= max; i++) {
	for(var j = 0; j <= max; j++) {
		add(i, j-1, i, j);				
		add(i, j, i, j+1);				
		add(i-1, j, i, j);				
		add(i, j, i+1, j);						
	}
}
var geojson = {
	type: "FeatureCollection",
	features: fc
}
console.log(JSON.stringify(geojson));

// feed PathFinder with square network
var pathfinder = new PathFinder(geojson);

var path = pathfinder.findPath({
		"type": "Feature",
		"geometry": {
			"type": "Point",
			"coordinates": [
				0,
				1
			]
		}
	},{
		"type": "Feature",
		"geometry": {
			"type": "Point",
			"coordinates": [
				2,
				0
			]
		}
	}
);

console.log(path ? path : 'Cannot find path');
