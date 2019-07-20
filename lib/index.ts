import * as path from 'path';
import * as bddJsonReporter from './bdd-json-reporter';

interface Pattern {
	pattern: string;
	included: boolean;
	served: boolean;
	watched: boolean;
}

function createPattern(pattern: string) {
	return { pattern: pattern, included: true, served: true, watched: false };
}

function initCucumber(files: Pattern[]) {
	var cucumberPath = path.dirname(require.resolve('cucumber'));

	files.unshift(createPattern(cucumberPath + "/../dist/cucumber.js"));
	files.unshift(createPattern(require.resolve('wolfy87-eventemitter')));
	files.unshift(createPattern(__dirname + "/adapter.js"));
}

initCucumber.$inject = ['config.files'];

module.exports = {
	'framework:cucumber-js': ['factory', initCucumber],
	'reporter:bdd-json': ['type', bddJsonReporter.BDDJSONReporter]
};
