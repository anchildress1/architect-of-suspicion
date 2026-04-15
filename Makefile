.PHONY: dev build test lint typecheck format check docker-build docker-run clean

dev:
	pnpm run dev

build:
	pnpm run build

test:
	pnpm run test

lint:
	pnpm run lint

typecheck:
	pnpm run typecheck

format:
	pnpm run format

check: lint typecheck test build

docker-build:
	docker build -t architect-of-suspicion .

docker-run:
	docker run -p 8080:8080 --env-file .env architect-of-suspicion

clean:
	rm -rf node_modules .svelte-kit build
