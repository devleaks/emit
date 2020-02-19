const { gitDescribe, gitDescribeSync } = require('git-describe')
const gitlog = require('gitlog')

const options = {
    repo: __dirname,
    number: 20,
    author: 'Pierre M',
    fields: ['abbrevHash','authorDateRel'],
    execOptions: {
        maxBuffer: 1000 * 1024
    }
}

exports.version = function() {
    const gitInfo = gitDescribeSync()
    let commits = gitlog(options)
    const latest = commits[0]
    return gitInfo.tag + " " + latest.authorDateRel + " (" + latest.abbrevHash + "-" + commits.length + ")"
}