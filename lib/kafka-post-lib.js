const moment = require('moment')
const debug = require('../lib/debug')

const kafka = require('kafka-node');
const config = require('../kafka-config');

function ksend(record, doKafka = false) {
    debug.print(record)

    if(!doKafka) return

    try {
      const Producer = kafka.Producer;
      const client = new kafka.Client(config.kafka_server);
      const producer = new Producer(client);
      const kafka_topic = record.queue;
      let payloads = [
        {
          topic: kafka_topic,
          messages: record
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
}

function _post(records, options) {
    if (records.length < 1)
        return false;
    const r = records.shift()
    ksend(r, options.kafka)
    if (records.length > 0) {
        const n = records[0]
        var w = options.rate
        if (options.speed > 0) {
            var duration = moment(n.datetime, moment.ISO_8601).diff(moment(r.datetime, moment.ISO_8601))
            w = moment.duration(duration).seconds() / options.speed
        }
        debug.print("waiting " + w + " secs...", records.length + " left" /*, r.datetime, n.datetime*/ )
        setTimeout(_post, w * 1000, records, options)
    }
}

exports.post = function(records, options) {
    _post(records, options)
}