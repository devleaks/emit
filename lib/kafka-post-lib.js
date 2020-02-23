const moment = require('moment')
const debug = require('../lib/debug')
//const kafka = require('kafka-node');
const config = require('../kafka-config');

/*
try {
  const Producer = kafka.Producer;
  const client = new kafka.Client(config.kafka_server);
  const producer = new Producer(client);
  const kafka_topic = config.kafka_topic;
  console.log(kafka_topic);

  let payloads = [
    {
      topic: kafka_topic,
      messages: config.kafka_topic
    }
  ];

  producer.on('ready', async function() {
    let push_status = producer.send(payloads, (err, data) => {
      if (err) {
        console.log('[kafka-producer -> '+kafka_topic+']: broker update failed');
      } else {
        console.log('[kafka-producer -> '+kafka_topic+']: broker update success');
      }
    });
  });

  producer.on('error', function(err) {
    console.log(err);
    console.log('[kafka-producer -> '+kafka_topic+']: connection errored');
    throw err;
  });
}
catch(e) {
  console.log(e);
}
*/

function ksend(record) {
    debug.print(record)
}

function _post(records, options) {
    if(records.length < 1)
        return false;
    const r = records.shift()
    ksend(r)
    if(records.length > 0) {
        const n = records[0]
        var w = options.rate
        if(options.speed > 0) {
            var duration = moment(n.datetime, moment.ISO_8601).diff(moment(r.datetime, moment.ISO_8601))
            w = moment.duration(duration).seconds() / options.speed
        }
        debug.print("waiting " +  w + " secs...", records.length + " left" /*, r.datetime, n.datetime*/)
        setTimeout(_post, w * 1000, records, options)
    }
}

exports.post = function(records, options) {
    _post(records, options)
}