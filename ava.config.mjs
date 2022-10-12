export default {
	"files": [
		"./src/tests/**/*"
	],
	"failFast": true,
	"failWithoutAssertions": false,
	"verbose": true,
	"timeout": "1m",
	"typescript": {
		"extensions": [
			"ts"
		],
		"rewritePaths": {
			"src/": "dist/"
		},
		"compile": false
	}
}