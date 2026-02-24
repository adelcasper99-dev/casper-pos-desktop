const { getReportData } = require('./src/actions/reports-actions');

async function test() {
    console.log(await getReportData({}));
}

test();
