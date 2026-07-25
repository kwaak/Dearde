# Build from the REPOSITORY ROOT (the server depends on packages/game_core):
#   docker build -f server/Dockerfile -t galactic-conflict-server .
FROM dart:stable AS build
WORKDIR /app
COPY packages/ packages/
COPY server/ server/
WORKDIR /app/server
RUN dart pub get
RUN dart compile exe bin/server.dart -o /server-bin

FROM scratch
COPY --from=build /runtime/ /
COPY --from=build /server-bin /server-bin
ENV PORT=8080
ENV TICK_SECONDS=15
ENV WORLD_FILE=/data/world.json
EXPOSE 8080
CMD ["/server-bin"]
