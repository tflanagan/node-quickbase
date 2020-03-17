export default {
	"files": [
		"./src/tests/**/*"
	],
	"failFast": true,
	"failWithoutAssertions": false,
	"verbose": true,
	"typescript": {
		"extensions": [
			"ts"
		],
		"rewritePaths": {
			"src/": "dist/"
		}
	}
}