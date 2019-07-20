const path = require('path');
const fs = require('fs');

function hasValidSuite(karmaLog, result) {
	if (result.suite.length != 2) {
		karmaLog.warn("Unexpected suite: " + result.suite);
		return;
	}
	return true;
}

function onRunComplete(bddjsonReporter, config, helper, karmaLog) {
	var
		reporterConfig = config.bddJSONReporter || { outputFile: null },
		outputFile = !reporterConfig.outputFile ? null : helper.normalizeWinPath(path.resolve(config.basePath, reporterConfig.outputFile)),
		report = bddjsonReporter.report
		;

	if (outputFile) {
		helper.mkdirIfNotExists(path.dirname(outputFile), () => {
			fs.writeFile(outputFile, JSON.stringify(report, null, 4), (error) => {
				if (error) {
					karmaLog.warn("Cannot write JSON:\n\t" + error.message);
				}
			});
		});
	}
	bddjsonReporter.report = {};
}

function onSpecComplete(bddjsonReporter: BDDJSONReporter, browser, result) {
	if (bddjsonReporter.hasValidSuite(result)) {
		let stepStatus = bddjsonReporter.getStepStatus(result);

		if (!bddjsonReporter.report[result.suite[0]]) {
			bddjsonReporter.report[result.suite[0]] = { featureStatus: null };
		}

		bddjsonReporter.report[result.suite[0]][result.suite[1]] = bddjsonReporter.mergeStatus(bddjsonReporter.report[result.suite[0]][result.suite[1]], stepStatus);
		bddjsonReporter.report[result.suite[0]].featureStatus = bddjsonReporter.mergeStatus(bddjsonReporter.report[result.suite[0]].featureStatus, bddjsonReporter.report[result.suite[0]][result.suite[1]]);
	}
}

export class BDDJSONReporter {
	failed = 'failed';
	passed = 'passed';
	pending = 'pending';
	$inject = ['baseReporterDecorator', 'logger', 'helper', 'config'];
	hasValidSuite;
	onRunComplete;
	onSpecComplete;
	report;

	constructor(baseReporterDecorator, logger, helper, config) {
		const karmaLog = logger.create('bdd-json');

		this.hasValidSuite = (result) => { return hasValidSuite(karmaLog, result); };
		this.onRunComplete = () => { onRunComplete(this, config, helper, karmaLog); };
		this.onSpecComplete = (browser, result) => { onSpecComplete(this, browser, result); };
		this.report = {};
	}

	getStepStatus(result) {
		if (result.success) {
			return !result.skipped ? this.passed : this.pending;
		}

		return !result.skipped ? this.failed : this.pending;
	}

	mergeStatus(currStatus, newStatus) {
		if (currStatus === this.failed) {
			return this.failed;
		}

		if (currStatus === this.pending) {
			return this.pending;
		}

		return newStatus;
	}
}

