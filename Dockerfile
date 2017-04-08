
#latest long term support version of node
FROM node:boron

# Create app directory
RUN mkdir -p /data
WORKDIR /data

# Install app dependencies
COPY package.json /data
RUN npm install

# Bundle app source
COPY . /data

EXPOSE 8000
CMD [ "npm", "start" ]