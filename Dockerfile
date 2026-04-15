FROM node:18

# Create app log directory
RUN mkdir -p /var/log/app

# Copy and install Node dependencies
COPY package.json /app/package.json
WORKDIR /app
RUN npm install

# Copy app code
COPY . /app

# Copy and set entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]