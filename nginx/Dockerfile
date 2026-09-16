# Make sure NODE_VERSION matches the version in gallery-app/.nvmrc
ARG NODE_VERSION=24
FROM node:$NODE_VERSION-alpine AS build
WORKDIR /app
COPY gallery-app/package.json gallery-app/package-lock.json ./
RUN npm ci
COPY gallery-app/ .
# The API's origin, empty on purpose: the SPA is served from the same origin as
# the API. It is an origin, not a path: the client adds /api/v1 itself
# (src/lib/api/client.ts), so setting this to "/api" would produce
# `/api/api/v1/albums`.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
