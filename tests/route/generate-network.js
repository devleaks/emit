var fc = [];
function add(x1, y1, x2, y2) {
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
var max = 3;
for(var i = 0; i <= max; i++) {
	add(i, 0, i, max);
}
for(var j = 0; j <= max; j++) {
	add(0, j, max, j);	
}
var gfc = {
	type: "FeatureCollection",
	features: fc
}
console.log(JSON.stringify(gfc));