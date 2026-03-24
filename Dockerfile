FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY backend/package.json ./backend/
RUN cd backend && npm install --production

COPY backend/server.js ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "backend/server.js"]
