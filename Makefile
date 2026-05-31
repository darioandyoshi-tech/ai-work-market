.PHONY: install test deploy clean

install:
	npm install

test:
	npm test

deploy:
	npx hardhat run scripts/deploy.js --network localhost

clean:
	rm -rf node_modules
	rm -rf dist