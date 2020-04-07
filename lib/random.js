exports.randn_bm = function(min, max, skew) {  // -30, 80, 1.3
    let u = 0,
        v = 0;
    while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
    num = Math.pow(num, skew); // Skew
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
    return num;
}


exports.randomValue = function(base, plusminus = false) {
    var ret = 0
    if(Array.isArray(base)) {
        ret = base[0] + Math.round(Math.random() * Math.abs(base[1]-base[0]))
    } else {
        ret = Math.round(Math.random() * base)
    }
    if(plusminus)
        ret *= Math.random() > 0.5 ? 1 : -1
    return ret
}

// Returns random element from array
exports.randomElemFrom = function(a) {
    return a[Math.floor(Math.random() * a.length)]
}

