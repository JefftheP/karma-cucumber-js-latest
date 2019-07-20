const GLOBAL = typeof window !== 'undefined' ? window : global;

function getGlobalValue(globalName: string, defVal: any) {
	return (GLOBAL as any)[globalName] || defVal;
}

const Cucumber = getGlobalValue('Cucumber', {});
const EventEmitter = getGlobalValue('EventEmitter', () => { });
const karma = getGlobalValue('karma', {});
const __karma__ = getGlobalValue('__karma__', {});
let __adapter__ = getGlobalValue('__adapter__', {})

class CucumberTestCase {
	sourceLocation;
	result;
	totalSteps;
	completedSteps;
	log;
	_status;

	constructor(status, public _ADAPTER_) {
		this._status = status || { steps: [] };
		this.sourceLocation = this._status.sourceLocation || {
			uri: "",
			line: 0
		};
		this.result = {
			duration: 0,
			exception: {
				message: "",
				showDiff: true,
				actual: null,
				expected: null
			},
			status: ""
		};
		this.totalSteps = this._status.steps.length;
		this.completedSteps = [];
		this.log = [];
	}

	getStatus() {
		return this._status;
	}

	getFeatureDescription() {
		const featureLines = this.getFeatureLines();
		for (let i = 0; i < featureLines.length; i++) {
			if (featureLines[i].toLowerCase().indexOf("feature:") !== -1) {
				return featureLines[i].replace(/^(.*)?feature:\s*/i, "");
			}
		}
		return "";
	}


	getFeatureLines() {
		return this._ADAPTER_.loadTestFiles([this.sourceLocation.uri])[0][1].split(/\n/gi);
	}

	getScenarioDescription() {
		var featureLines = this.getFeatureLines();
		return featureLines[this.sourceLocation.line - 1].replace(/scenario:\s?/i, "");
	}
}

class CucumberTestStep {
	sourceLocation;
	result;
	status;
	exception;

	constructor(status, public _ADAPTER_) {
		this.status = status || { testCase: {}, index: 0 };
		this.sourceLocation = status.testCase.sourceLocation || {
			uri: "",
			line: 0
		};
		this.result = this.status.result || {
			duration: 0,
			exception: {
				message: "",
				showDiff: true,
				actual: null,
				expected: null
			},
			status: ""
		};
	}

	getId() {
		var description = this.getDescription();
		return description + " <- " + this.sourceLocation.uri + ":" + (this.sourceLocation.line + (description.indexOf("Scenario:") === 0 ? 0 : this.status.index + 1));
	};

	getDescription() {
		var description = (this.getFeatureFileLines(this.sourceLocation.uri)[(this.sourceLocation.line + this.status.index)] || "").trim();
		return description !== "" ? description : this.getFeatureFileLines(this.sourceLocation.uri)[this.sourceLocation.line - 1].trim();
	};

	getFeatureFileLines(uri) {
		return this._ADAPTER_.loadTestFiles([uri])[0][1].split("\n");
	}

}

class CucumberAdapter {
	fileCache = {};
	completedFatures;
	karma;
	testCaseCache;
	totalFeatures;
	totalSteps;
	log;
	results;

	constructor(karma, public _ADAPTER_: CucumberAdapter) {
		this.completedFatures = 0;
		this.karma = karma;
		this.testCaseCache = {};
		this.totalFeatures = 0;
		this.totalSteps = 0;
		this.log = [];
		this.results = [];
	}

	createTestCase(status) {
		var cucumberTestCase = this.testCaseCache[status.sourceLocation.uri + status.sourceLocation.line] = new CucumberTestCase(status, this);
		this.totalSteps += cucumberTestCase.totalSteps;
	}

	getStart() {
		const
			featuresUrls = Object.keys(this.karma.files).filter((f) => { return /\.feature$/.test(f); }),
			features: Array<any> = this._ADAPTER_.loadTestFiles(featuresUrls),
			stepUrls = Object.keys(this.karma.files).filter((f) => { return /steps(\/.*)?\.js$/.test(f); }),
			tagExpression = this._ADAPTER_.getTagExpression(this.karma.config.args);

		for (let property in Cucumber) {
			if (Cucumber.hasOwnProperty(property)) {
				global[property] = Cucumber[property];
			}
		}

		this.totalFeatures = features.length;
		Cucumber.supportCodeLibraryBuilder.reset('');
		this.runFeatures(features, stepUrls, tagExpression);
	}

	runFeatures(features, stepUrls, tagExpression) {
		let stepsLeftToLoad = stepUrls.length;

		const _runFeatures = () => {
			if (--stepsLeftToLoad <= 0) {
				features.forEach((feature, index) => {
					this.runFeature(feature, tagExpression);
				});
			}
		}

		if (features.length === 0) { return this.karma.complete({ coverage: (window as any).__coverage__ }); }
		if (stepUrls.length === 0) { _runFeatures(); }

		stepUrls.forEach((stepUrl, index) => {
			const
				script = document.createElement("script"),
				scripts = document.getElementsByTagName("script");

			script.src = stepUrl;
			script.type = "text/javascript";
			script.setAttribute("crossorigin", "anonymous");
			script.onload = _runFeatures;
			script.onerror = () => { console.log("error loading step: " + stepUrl); _runFeatures(); };
			document.body.insertBefore(script, scripts[scripts.length - 1]);
		});
	}

	runFeature(feature, tagExpression) {
		const
			eventBroadcaster = new EventEmitter(),
			eventDataCollector = new Cucumber.formatterHelpers.EventDataCollector(eventBroadcaster),
			supportCodeLibrary = Cucumber.supportCodeLibraryBuilder.finalize(),
			pickleFilter = new Cucumber.PickleFilter({ tagExpression: tagExpression }),
			testCases = Cucumber.getTestCases({
				eventBroadcaster: eventBroadcaster,
				pickleFilter: pickleFilter,
				source: feature[1],
				uri: feature[0]
			}),
			formatterOptions = {
				colorsEnabled: true,
				cwd: '/',
				eventBroadcaster: eventBroadcaster,
				eventDataCollector: eventDataCollector,
				log: (stdout) => {
					if (stdout.trim() !== "") {
						if (stdout.toLowerCase().indexOf("scenario") !== -1) {
							this.log.push(this.getFeatureName(feature));
						}

						this.log.push(stdout.trim());
					}
				},
				supportCodeLibrary: supportCodeLibrary
			};


		Cucumber.FormatterBuilder.build('summary', formatterOptions);
		const cucumberInstance = new Cucumber.Runtime({
			eventBroadcaster: eventBroadcaster,
			options: {},
			testCases: testCases,
			supportCodeLibrary: supportCodeLibrary
		});

		eventBroadcaster.on("test-case-prepared", (status) => { this.createTestCase(status); });
		eventBroadcaster.on("test-step-finished", (status) => { this.logTestStep(status); });

		cucumberInstance
			.start()
			.then((success) => {
				this.completedFatures++;
				this.checkAllFeaturesTested(["success: ", success], feature);
			})
			.catch((error) => {
				this.completedFatures++;
				this.checkAllFeaturesTested(["error: ", error], feature);
			});
	}

	checkAllFeaturesTested(status, feature) {
		if (this.completedFatures >= this.totalFeatures) {
			console.log(this.log.join("\n"));

			this.results.forEach((result, index) => {
				this.karma.info({ total: this.totalSteps });
				this.karma.result(result);
			});

			return this.karma.complete({ coverage: (window as any).__coverage__ });
		}
	}

	getFeatureName(feature) {
		const
			fileContents = feature[1],
			fileUrl = feature[0],
			myRegex = /feature:([^\n\r]*)/gi,
			parts = myRegex.exec(fileContents),
			featureName = parts[1].trim();

		return "\n\x1b[93mFeature: " + featureName + " \x1b[33m(" + fileUrl + ")\x1b[0m";
	}

	logTestStep(status) {
		const
			testCase = status.testCase,
			cucumberTestCase = this.testCaseCache[testCase.sourceLocation.uri + testCase.sourceLocation.line],
			cucumberTestStep = new CucumberTestStep(status, this),
			result = {
				id: cucumberTestStep.getId(),
				description: cucumberTestStep.getDescription(),
				log: [],
				suite: [cucumberTestCase.getFeatureDescription(), cucumberTestCase.getScenarioDescription()],
				success: false,
				skipped: false,
				time: (cucumberTestStep.result.duration || 0)
			};

		switch (cucumberTestStep.result.status) {
			case 'passed':
				result.success = true;
				break;
			case 'pending':
				result.skipped = true;
				result.log.push("Step is pending: " + result.suite.join(' -> ') + " -> " + result.id);
				break;
			case 'undefined':
				result.log.push("Step is undefined: " + result.suite.join(' -> ') + " -> " + result.id);
			/* falls through */
			case 'skipped':
				result.success = true;
				result.skipped = true;
				break;
			case 'ambiguous':
				result.log.push("Step is ambiguous: " + result.id);
				break;
			default:
				let error = cucumberTestStep.exception || {};
				let errorMessage = "";

				Object.keys(error).forEach((key, index) => {
					errorMessage += "\n" + key + ": " + error[key];
				});
				result.log.push("Step: " + result.id + errorMessage);
		}
		cucumberTestCase.completedSteps.push(cucumberTestStep);
		this.results.push(result);
	}

	loadTestFiles(featuresUrls) {
		return featuresUrls.map((f) => { return [f, this.loadFile(f)]; });
	}

	loadFile(url) {
		let client;

		if (this.fileCache[url] === undefined) {
			client = new XMLHttpRequest();
			client.open("GET", url, false);
			client.send();
			this.fileCache[url] = client.responseText;
		}

		return this.fileCache[url];
	}

	getTagExpression(args) {
		let tagsIndex = args.indexOf('--tags');
		if (tagsIndex === -1) {
			return "";
		}

		let doAddTagExpression = true;
		let lastTagsIndex = args.indexOf("--", tagsIndex + 1);
		let tags = args.slice(tagsIndex + 1, lastTagsIndex < 0 ? args.length : lastTagsIndex).filter((s) => { return !!s; });
		if (tags.length <= 0) { return ""; }

		let tagExpression = "(";
		tags.forEach((tag, index) => {
			if (tag.match(/^--tags$/i)) {
				tagExpression += ") and (";
				doAddTagExpression = true;
			} else if (tag.match(/--[\w\d]*/gi)) {
				doAddTagExpression = false;
			} else if (doAddTagExpression) {
				if (tagExpression.substring(tagExpression.length - 1) !== "(") { tagExpression += " or "; }
				tagExpression += tag.replace("~", "not ").replace(/\s*,\s*/gi, " or ");
			}
		});
		tagExpression += ")";
		return tagExpression;
	}
}

karma.CucumberAdapter = CucumberAdapter;
const adapter = new karma.CucumberAdapter(__karma__);
__adapter__ = adapter;
__karma__.start = adapter.getStart();

