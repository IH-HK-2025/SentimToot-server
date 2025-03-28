# SentimToot Server

This is the backend server for the SentimToot project, which provides sentiment analysis and Mastodon integration. The server is built using Node.js, Express, and Prisma ORM, and it is deployed on [Render](https://render.com).

## Deployment

The server is live and deployed on Render. You can access it at:

**Base URL:** [https://sentimtoot-server.onrender.com](https://sentimtoot-server.onrender.com)

## Endpoints

Below is a table of the available API endpoints:

| HTTP Method | Endpoint                       | Description                                                      | Authentication Required |
| ----------- | ------------------------------ | ---------------------------------------------------------------- | ----------------------- |
| `POST`      | `/api/auth/signup`             | Register a new user.                                             | No                      |
| `POST`      | `/api/auth/login`              | Log in and receive a JWT token.                                  | No                      |
| `PUT`       | `/api/auth/password`           | Change the password of an existing user.                         | Yes                     |
| `GET`       | `/api/auth/verify`             | Verify the JWT token and retrieve user details.                  | Yes                     |
| `GET`       | `/api/auth/users`              | Fetch all users with their details.                              | No                      |
| `GET`       | `/api/auth/users/history/:id`  | Retrieve the search history of a specific user.                  | Yes                     |
| `DELETE`    | `/api/auth/users/history/:id`  | Clear the search history of a specific user.                     | Yes                     |
| `GET`       | `/api/auth/users/toots/:id`    | Fetch Mastodon toots of a specific user with sentiment analysis. | Yes                     |
| `PATCH`     | `/api/auth/edit-toots/:tootId` | Edit a specific Mastodon toot.                                   | Yes                     |
| `DELETE`    | `/api/auth/toots/:tootId`      | Delete a specific Mastodon toot.                                 | Yes                     |
| `DELETE`    | `/api/auth/users/:id`          | Delete a user account.                                           | Yes                     |
| `POST`      | `/api/user/token`              | Save the Mastodon token for a user.                              | Yes                     |
| `GET`       | `/api/user/token`              | Retrieve the Mastodon token for a user.                          | Yes                     |
| `GET`       | `/api/trends`                  | Analyze Mastodon trends and their sentiment distribution.        | Yes                     |
| `POST`      | `/api/trends`                  | Perform sentiment analysis on Mastodon trends and posts.         | Yes                     |
| `GET`       | `/api/mastodon`                | Search Mastodon posts by keyword and analyze their sentiment.    | Yes                     |
| `POST`      | `/api/toot`                    | Post a new toot to Mastodon.                                     | Yes                     |
| `GET`       | `/api/health`                  | Check the health of the server and database connection.          | No                      |

## GitHub Repository

The source code for the server is available on GitHub:

[https://github.com/IH-HK-2025/SentimToot-server](https://github.com/IH-HK-2025/SentimToot-server)

## Running Locally

To run the server locally, follow these steps:

1. Clone the repository:

   ```bash
   git clone https://github.com/IH-HK-2025/SentimToot-server.git
   cd SentimToot-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up the environment variables in a `.env` file:

   ```env
   DATABASE_URL=your_database_url
   TOKEN_SECRET=your_jwt_secret
   GEMINI_API_KEY=your_google_generative_ai_key
   ```

4. Run the server:

   ```bash
   npm run dev
   ```

5. The server will be available at `http://localhost:3000`.

## Notes

- Ensure that your database is properly configured and accessible.
- The server uses Prisma ORM, so make sure to run `npx prisma migrate dev` to apply any database migrations.

For any issues or questions, feel free to open an issue on the GitHub repository.
